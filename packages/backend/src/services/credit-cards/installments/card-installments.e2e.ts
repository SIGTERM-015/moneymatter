import {
  ACCOUNT_CATEGORIES,
  CARD_INSTALLMENT_PLAN_STATUSES,
  CARD_INSTALLMENT_STATUSES,
  type RecordId,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

const createCard = () =>
  helpers.createAccount({
    payload: helpers.buildAccountPayload({ accountCategory: ACCOUNT_CATEGORIES.creditCard, creditLimit: 5000 }),
    raw: true,
  });

const createBank = () =>
  helpers.createAccount({ payload: helpers.buildAccountPayload({ initialBalance: 10000 }), raw: true });

const spendOnCard = async ({ cardId, amount, time }: { cardId: RecordId; amount: number; time: string }) => {
  const [tx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId: cardId,
      amount,
      time,
      transactionType: TRANSACTION_TYPES.expense,
    }),
    raw: true,
  });
  return tx;
};

const payCard = async ({
  bankId,
  cardId,
  amount,
  time,
}: {
  bankId: RecordId;
  cardId: RecordId;
  amount: number;
  time: string;
}) => {
  const [bankLeg, cardLeg] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({ accountId: bankId, amount, time }),
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: amount,
      destinationAccountId: cardId,
    },
    raw: true,
  });
  return { bankLeg, cardLeg: cardLeg! };
};

// The account endpoint answers decimals; the helper is typed with the model.
const cardBalance = async ({ cardId }: { cardId: string }) =>
  Number((await helpers.getAccount({ id: cardId, raw: true })).currentBalance);

const statuses = async ({ cardId }: { cardId: string }) => {
  const [plan] = await helpers.getCardInstallmentPlans({ accountId: cardId, raw: true });
  return plan!.installments.map((installment) => installment.status);
};

/**
 * The user's case: a 450 purchase deferred into three monthly charges from November, so
 * `due(2026-11)` is 150. The statement before November is the calendar month of October.
 */
const setUpDeferredPurchase = async ({ otherOctoberSpend }: { otherOctoberSpend: number }) => {
  const [card, bank] = await Promise.all([createCard(), createBank()]);
  const purchase = await spendOnCard({ cardId: card.id, amount: 450, time: '2026-10-10T10:00:00.000Z' });
  await spendOnCard({ cardId: card.id, amount: otherOctoberSpend, time: '2026-10-12T10:00:00.000Z' });

  const plan = await helpers.createCardInstallmentPlan({
    accountId: card.id,
    payload: {
      title: 'Laptop',
      principal: 450,
      firstDueMonth: '2026-11',
      amounts: [150, 150, 150],
      purchaseTransactionId: purchase.id,
    },
    raw: true,
  });

  return { card, bank, plan, purchase };
};

describe('Card installments', () => {
  describe('POST /accounts/:id/credit-card/installments', () => {
    it('stores the bank amounts per installment and reports the estimated interest', async () => {
      const card = await createCard();

      const plan = await helpers.createCardInstallmentPlan({
        accountId: card.id,
        payload: {
          title: 'Sofa',
          principal: 1200,
          firstDueMonth: '2026-12',
          amounts: [300, 300, 300, 312.5],
          apr: 19.99,
          interestFreeMonths: 3,
        },
        raw: true,
      });

      expect(plan).toMatchObject({
        accountId: card.id,
        title: 'Sofa',
        principal: 1200,
        installmentsCount: 4,
        firstDueMonth: '2026-12',
        apr: 19.99,
        interestFreeMonths: 3,
        purchaseTransactionId: null,
        status: CARD_INSTALLMENT_PLAN_STATUSES.active,
        paidCount: 0,
        totalAmount: 1212.5,
        remainingAmount: 1212.5,
        estimatedInterest: 12.5,
      });
      expect(plan.installments.map(({ dueMonth, amount, status }) => ({ dueMonth, amount, status }))).toEqual([
        { dueMonth: '2026-12', amount: 300, status: CARD_INSTALLMENT_STATUSES.pending },
        { dueMonth: '2027-01', amount: 300, status: CARD_INSTALLMENT_STATUSES.pending },
        { dueMonth: '2027-02', amount: 300, status: CARD_INSTALLMENT_STATUSES.pending },
        { dueMonth: '2027-03', amount: 312.5, status: CARD_INSTALLMENT_STATUSES.pending },
      ]);
    });

    it('splits the principal equally from a count', async () => {
      const card = await createCard();

      const plan = await helpers.createCardInstallmentPlan({
        accountId: card.id,
        payload: { title: 'Phone', principal: 100, firstDueMonth: '2026-11', installmentsCount: 3 },
        raw: true,
      });

      expect(plan.installments.map((installment) => installment.amount)).toEqual([33.34, 33.33, 33.33]);
      expect(plan.estimatedInterest).toBe(0);
    });

    it.each([
      ['no amounts and no count', { title: 'X', principal: 100, firstDueMonth: '2026-11' }],
      [
        'a count that disagrees with the amounts',
        { title: 'X', principal: 100, firstDueMonth: '2026-11', amounts: [50, 50], installmentsCount: 3 },
      ],
      ['a zero installment', { title: 'X', principal: 100, firstDueMonth: '2026-11', amounts: [100, 0] }],
      ['a malformed month', { title: 'X', principal: 100, firstDueMonth: '2026-13', installmentsCount: 2 }],
      ['an empty title', { title: ' ', principal: 100, firstDueMonth: '2026-11', installmentsCount: 2 }],
      ['a negative principal', { title: 'X', principal: -1, firstDueMonth: '2026-11', installmentsCount: 2 }],
      ['too many installments', { title: 'X', principal: 100, firstDueMonth: '2026-11', installmentsCount: 121 }],
    ])('responds 422 for %s and stores nothing', async (_label, payload) => {
      const card = await createCard();

      const res = await helpers.createCardInstallmentPlan({ accountId: card.id, payload });

      expect(res.statusCode).toBe(422);
      expect(await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true })).toEqual([]);
    });

    it('rejects a purchase that is not an expense on this card, and a purchase deferred twice', async () => {
      const [card, otherCard] = await Promise.all([createCard(), createCard()]);
      const foreignPurchase = await spendOnCard({ cardId: otherCard.id, amount: 90, time: '2026-10-01T10:00:00.000Z' });
      const purchase = await spendOnCard({ cardId: card.id, amount: 90, time: '2026-10-01T10:00:00.000Z' });
      const base = { title: 'X', principal: 90, firstDueMonth: '2026-11', installmentsCount: 3 };

      const wrongCard = await helpers.createCardInstallmentPlan({
        accountId: card.id,
        payload: { ...base, purchaseTransactionId: foreignPurchase.id },
      });
      expect(wrongCard.statusCode).toBe(422);

      await helpers.createCardInstallmentPlan({
        accountId: card.id,
        payload: { ...base, purchaseTransactionId: purchase.id },
        raw: true,
      });
      const twice = await helpers.createCardInstallmentPlan({
        accountId: card.id,
        payload: { ...base, purchaseTransactionId: purchase.id },
      });
      expect(twice.statusCode).toBe(409);
    });

    it('responds 404 for a non-card account and for another user card', async () => {
      const bank = await createBank();
      const otherUser = await helpers.signUpSecondUser();
      const foreignCard = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: async () => {
          await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY_CODE });
          return createCard();
        },
      });
      const payload = { title: 'X', principal: 90, firstDueMonth: '2026-11', installmentsCount: 3 };

      expect((await helpers.createCardInstallmentPlan({ accountId: bank.id, payload })).statusCode).toBe(404);
      expect((await helpers.createCardInstallmentPlan({ accountId: foreignCard.id, payload })).statusCode).toBe(404);
      expect((await helpers.getCardInstallmentPlans({ accountId: foreignCard.id })).statusCode).toBe(404);
    });
  });

  describe('GET, PATCH and DELETE plans and installments', () => {
    it('lists nothing for a card without plans', async () => {
      const card = await createCard();

      expect(await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true })).toEqual([]);
    });

    it('edits a pending installment amount but not a paid one', async () => {
      const { card, bank, plan } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });
      const [first, second] = plan.installments;

      const edited = await helpers.updateCardInstallment({
        installmentId: second!.id,
        payload: { amount: 155.2 },
        raw: true,
      });
      expect(edited.amount).toBe(155.2);

      await payCard({ bankId: bank.id, cardId: card.id, amount: 150, time: '2026-11-05T10:00:00.000Z' });

      const res = await helpers.updateCardInstallment({ installmentId: first!.id, payload: { amount: 140 } });
      expect(res.statusCode).toBe(409);

      const [listed] = await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true });
      expect(listed!.estimatedInterest).toBe(5.2);
    });

    it('updates plan metadata and deletes the plan without touching the card balance', async () => {
      const { card, plan } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });
      const balanceBefore = await cardBalance({ cardId: card.id });

      const updated = await helpers.updateCardInstallmentPlan({
        accountId: card.id,
        planId: plan.id,
        payload: { title: 'Work laptop', apr: 12.5 },
        raw: true,
      });
      expect(updated.title).toBe('Work laptop');
      expect(updated.apr).toBe(12.5);

      expect((await helpers.deleteCardInstallmentPlan({ accountId: card.id, planId: plan.id })).statusCode).toBe(204);
      expect(await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true })).toEqual([]);
      expect(await cardBalance({ cardId: card.id })).toBe(balanceBefore);

      expect((await helpers.deleteCardInstallmentPlan({ accountId: card.id, planId: plan.id })).statusCode).toBe(404);
    });
  });

  describe('GET /accounts/:id/credit-card/summary', () => {
    it('adds the installments due in the month to the non-deferred statement spend', async () => {
      const { card } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });
      await spendOnCard({ cardId: card.id, amount: 80, time: '2026-11-03T10:00:00.000Z' });

      const november = await helpers.getCardMonthlySummary({ accountId: card.id, month: '2026-11', raw: true });
      expect(november).toMatchObject({
        month: '2026-11',
        statementFrom: '2026-11-01',
        statementTo: '2026-11-30',
        installmentsDue: 150,
        statementSpend: 80,
        expectedTotal: 230,
      });
      expect(november.installments.map((installment) => installment.planTitle)).toEqual(['Laptop']);

      // The deferred purchase is billed through its installments, not the October statement.
      const october = await helpers.getCardMonthlySummary({ accountId: card.id, month: '2026-10', raw: true });
      expect(october).toMatchObject({ installmentsDue: 0, statementSpend: 200, expectedTotal: 200 });
    });

    it('uses the statement day when the card has one', async () => {
      const card = await createCard();
      await helpers.upsertCreditCardDetails({ accountId: card.id, payload: { statementDay: 25 }, raw: true });
      await spendOnCard({ cardId: card.id, amount: 30, time: '2026-10-25T10:00:00.000Z' });
      await spendOnCard({ cardId: card.id, amount: 70, time: '2026-10-26T10:00:00.000Z' });

      const summary = await helpers.getCardMonthlySummary({ accountId: card.id, month: '2026-10', raw: true });

      expect(summary).toMatchObject({
        statementFrom: '2026-09-26',
        statementTo: '2026-10-25',
        installmentsDue: 0,
        statementSpend: 30,
        expectedTotal: 30,
      });
    });

    it('responds 422 for a malformed month and 404 for a non-card account', async () => {
      const [card, bank] = await Promise.all([createCard(), createBank()]);

      expect((await helpers.getCardMonthlySummary({ accountId: card.id, month: '2026-1' })).statusCode).toBe(422);
      expect((await helpers.getCardMonthlySummary({ accountId: bank.id, month: '2026-11' })).statusCode).toBe(404);
    });
  });

  describe('matching transfers into the card', () => {
    it('marks the due installments paid when a transfer equals them, and only those', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });

      const { cardLeg } = await payCard({
        bankId: bank.id,
        cardId: card.id,
        amount: 150,
        time: '2026-11-05T10:00:00.000Z',
      });

      const [plan] = await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true });
      expect(plan!.installments.map((installment) => installment.status)).toEqual([
        CARD_INSTALLMENT_STATUSES.paid,
        CARD_INSTALLMENT_STATUSES.pending,
        CARD_INSTALLMENT_STATUSES.pending,
      ]);
      expect(plan!.installments[0]!.paidTransactionId).toBe(cardLeg.id);
      expect(plan!.paidCount).toBe(1);
      expect(plan!.remainingAmount).toBe(300);
    });

    it('settles overdue installments together and completes the plan', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });

      await payCard({ bankId: bank.id, cardId: card.id, amount: 300, time: '2026-12-05T10:00:00.000Z' });
      await payCard({ bankId: bank.id, cardId: card.id, amount: 150, time: '2027-01-05T10:00:00.000Z' });

      const [plan] = await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true });
      expect(plan!.status).toBe(CARD_INSTALLMENT_PLAN_STATUSES.completed);
      expect(plan!.paidCount).toBe(3);
    });

    it('leaves everything pending for a transfer that matches nothing', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });

      await payCard({ bankId: bank.id, cardId: card.id, amount: 149.99, time: '2026-11-05T10:00:00.000Z' });
      await payCard({ bankId: bank.id, cardId: card.id, amount: 150, time: '2026-10-20T10:00:00.000Z' });

      expect(await statuses({ cardId: card.id })).toEqual([
        CARD_INSTALLMENT_STATUSES.pending,
        CARD_INSTALLMENT_STATUSES.pending,
        CARD_INSTALLMENT_STATUSES.pending,
      ]);
    });

    it('never creates a card expense when an installment is paid', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });
      expect(await cardBalance({ cardId: card.id })).toBe(-650);

      await payCard({ bankId: bank.id, cardId: card.id, amount: 150, time: '2026-11-05T10:00:00.000Z' });

      expect(await cardBalance({ cardId: card.id })).toBe(-500);
    });

    it('proposes the match when the statement spend is the same amount, and confirm marks it paid', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 150 });

      await payCard({ bankId: bank.id, cardId: card.id, amount: 150, time: '2026-11-05T10:00:00.000Z' });

      const [plan] = await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true });
      expect(plan!.installments[0]!.status).toBe(CARD_INSTALLMENT_STATUSES.proposed);

      const confirmed = await helpers.resolveCardInstallment({
        installmentId: plan!.installments[0]!.id,
        decision: 'confirm',
        raw: true,
      });
      expect(confirmed.map((installment) => installment.status)).toEqual([CARD_INSTALLMENT_STATUSES.paid]);
      expect(confirmed[0]!.paidAt).toBe('2026-11-05T10:00:00.000Z');

      const again = await helpers.resolveCardInstallment({
        installmentId: plan!.installments[0]!.id,
        decision: 'confirm',
      });
      expect(again.statusCode).toBe(409);
    });

    it('reject returns the installments to pending and does not propose the same transfer again', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 150 });
      const { bankLeg } = await payCard({
        bankId: bank.id,
        cardId: card.id,
        amount: 150,
        time: '2026-11-05T10:00:00.000Z',
      });
      const [plan] = await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true });

      await helpers.resolveCardInstallment({ installmentId: plan!.installments[0]!.id, decision: 'reject', raw: true });
      expect(await statuses({ cardId: card.id })).toEqual([
        CARD_INSTALLMENT_STATUSES.pending,
        CARD_INSTALLMENT_STATUSES.pending,
        CARD_INSTALLMENT_STATUSES.pending,
      ]);

      // A note edit leaves the payment-relevant fields alone, so the rejection stands.
      await helpers.updateTransaction({ id: bankLeg.id, payload: { note: 'card payment' }, raw: true });
      expect((await statuses({ cardId: card.id }))[0]).toBe(CARD_INSTALLMENT_STATUSES.pending);
    });

    it('reverts to pending when the transfer is deleted, and re-matches on an edit back', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });

      const first = await payCard({ bankId: bank.id, cardId: card.id, amount: 150, time: '2026-11-05T10:00:00.000Z' });
      expect((await statuses({ cardId: card.id }))[0]).toBe(CARD_INSTALLMENT_STATUSES.paid);

      await helpers.updateTransaction({ id: first.bankLeg.id, payload: { amount: 160 }, raw: true });
      expect((await statuses({ cardId: card.id }))[0]).toBe(CARD_INSTALLMENT_STATUSES.pending);

      await helpers.updateTransaction({ id: first.bankLeg.id, payload: { amount: 150 }, raw: true });
      expect((await statuses({ cardId: card.id }))[0]).toBe(CARD_INSTALLMENT_STATUSES.paid);

      expect((await helpers.deleteTransaction({ id: first.bankLeg.id })).statusCode).toBe(200);
      expect(await statuses({ cardId: card.id })).toEqual([
        CARD_INSTALLMENT_STATUSES.pending,
        CARD_INSTALLMENT_STATUSES.pending,
        CARD_INSTALLMENT_STATUSES.pending,
      ]);
    });

    it('reverts when the transfer is unlinked', async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 200 });
      const { bankLeg } = await payCard({
        bankId: bank.id,
        cardId: card.id,
        amount: 150,
        time: '2026-11-05T10:00:00.000Z',
      });

      await helpers.unlinkTransferTransactions({ transferIds: [bankLeg.transferId!], raw: true });

      expect((await statuses({ cardId: card.id }))[0]).toBe(CARD_INSTALLMENT_STATUSES.pending);
    });

    it("responds 404 when confirming another user's installment", async () => {
      const { card, bank } = await setUpDeferredPurchase({ otherOctoberSpend: 150 });
      await payCard({ bankId: bank.id, cardId: card.id, amount: 150, time: '2026-11-05T10:00:00.000Z' });
      const [plan] = await helpers.getCardInstallmentPlans({ accountId: card.id, raw: true });

      const otherUser = await helpers.signUpSecondUser();
      const res = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: () => helpers.resolveCardInstallment({ installmentId: plan!.installments[0]!.id, decision: 'confirm' }),
      });

      expect(res.statusCode).toBe(404);
      expect((await statuses({ cardId: card.id }))[0]).toBe(CARD_INSTALLMENT_STATUSES.proposed);
    });
  });
});
