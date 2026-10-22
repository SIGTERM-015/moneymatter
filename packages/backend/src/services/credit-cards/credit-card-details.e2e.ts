import { ACCOUNT_CATEGORIES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import CreditCardDetails from '@models/credit-card-details.model';
import * as helpers from '@tests/helpers';

const createCard = async ({ initialBalance = 0, creditLimit = 0 }: { initialBalance?: number; creditLimit?: number }) =>
  helpers.createAccount({
    payload: helpers.buildAccountPayload({
      accountCategory: ACCOUNT_CATEGORIES.creditCard,
      initialBalance,
      creditLimit,
    }),
    raw: true,
  });

describe('Credit card details', () => {
  describe('GET /accounts/:id/credit-card', () => {
    it('returns defaults and the credit position when no details are stored', async () => {
      const card = await createCard({ initialBalance: -792, creditLimit: 3000 });

      const result = await helpers.getCreditCardDetails({ accountId: card.id, raw: true });

      expect(result).toEqual({
        accountId: card.id,
        statementDay: null,
        paymentDay: null,
        apr: null,
        interestFreeMonths: 0,
        creditLimit: 3000,
        used: 792,
        available: 2208,
      });
    });

    it('tracks spending on the card in used and available', async () => {
      const card = await createCard({ initialBalance: 0, creditLimit: 1000 });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: card.id,
          amount: 250.5,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const result = await helpers.getCreditCardDetails({ accountId: card.id, raw: true });

      expect(result.used).toBe(250.5);
      expect(result.available).toBe(749.5);
    });

    it('reads an overpaid card as nothing used and a card over its limit as nothing available', async () => {
      const overpaid = await createCard({ initialBalance: 120, creditLimit: 1000 });
      const overLimit = await createCard({ initialBalance: -1500, creditLimit: 1000 });

      const [overpaidResult, overLimitResult] = await Promise.all([
        helpers.getCreditCardDetails({ accountId: overpaid.id, raw: true }),
        helpers.getCreditCardDetails({ accountId: overLimit.id, raw: true }),
      ]);

      expect(overpaidResult.used).toBe(0);
      expect(overpaidResult.available).toBe(1000);
      expect(overLimitResult.used).toBe(1500);
      expect(overLimitResult.available).toBe(0);
    });

    it('responds 404 for an account that is not a credit card', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ accountCategory: ACCOUNT_CATEGORIES.general }),
        raw: true,
      });

      const res = await helpers.getCreditCardDetails({ accountId: account.id });

      expect(res.statusCode).toBe(404);
    });

    it("responds 404 for another user's credit card", async () => {
      const otherUser = await helpers.signUpSecondUser();
      const foreignCard = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: async () => {
          await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY_CODE });
          return createCard({ initialBalance: -100, creditLimit: 500 });
        },
      });

      const res = await helpers.getCreditCardDetails({ accountId: foreignCard.id });

      expect(res.statusCode).toBe(404);
    });

    it('responds 422 for an id that is not a uuid', async () => {
      const res = await helpers.getCreditCardDetails({ accountId: 'not-a-uuid' });

      expect(res.statusCode).toBe(422);
    });
  });

  describe('PUT /accounts/:id/credit-card', () => {
    it('creates the details on first save and returns them with the credit position', async () => {
      const card = await createCard({ initialBalance: -200, creditLimit: 2000 });

      const saved = await helpers.upsertCreditCardDetails({
        accountId: card.id,
        payload: { statementDay: 25, paymentDay: 5, apr: 19.99, interestFreeMonths: 3 },
        raw: true,
      });

      expect(saved).toEqual({
        accountId: card.id,
        statementDay: 25,
        paymentDay: 5,
        apr: 19.99,
        interestFreeMonths: 3,
        creditLimit: 2000,
        used: 200,
        available: 1800,
      });

      const fetched = await helpers.getCreditCardDetails({ accountId: card.id, raw: true });
      expect(fetched).toEqual(saved);
    });

    it('updates only the fields sent and clears a field sent as null', async () => {
      const card = await createCard({ creditLimit: 1000 });

      await helpers.upsertCreditCardDetails({
        accountId: card.id,
        payload: { statementDay: 25, paymentDay: 5, apr: 19.99, interestFreeMonths: 3 },
        raw: true,
      });

      const updated = await helpers.upsertCreditCardDetails({
        accountId: card.id,
        payload: { paymentDay: 10, apr: null },
        raw: true,
      });

      expect(updated.statementDay).toBe(25);
      expect(updated.paymentDay).toBe(10);
      expect(updated.apr).toBeNull();
      expect(updated.interestFreeMonths).toBe(3);
    });

    it('accepts the inclusive bounds', async () => {
      const card = await createCard({});

      const saved = await helpers.upsertCreditCardDetails({
        accountId: card.id,
        payload: { statementDay: 31, paymentDay: 1, apr: 100, interestFreeMonths: 0 },
        raw: true,
      });

      expect(saved.statementDay).toBe(31);
      expect(saved.paymentDay).toBe(1);
      expect(saved.apr).toBe(100);
      expect(saved.interestFreeMonths).toBe(0);
    });

    it.each([
      ['statementDay below 1', { statementDay: 0 }],
      ['paymentDay above 31', { paymentDay: 32 }],
      ['fractional day', { statementDay: 2.5 }],
      ['negative apr', { apr: -1 }],
      ['apr above 100', { apr: 100.01 }],
      ['apr with more than four decimals', { apr: 19.12345 }],
      ['negative interestFreeMonths', { interestFreeMonths: -1 }],
      ['null interestFreeMonths', { interestFreeMonths: null }],
      ['unknown field', { creditLimit: 5000 }],
    ])('responds 422 for %s and stores nothing', async (_label, payload) => {
      const card = await createCard({});

      const res = await helpers.upsertCreditCardDetails({ accountId: card.id, payload });
      expect(res.statusCode).toBe(422);

      const fetched = await helpers.getCreditCardDetails({ accountId: card.id, raw: true });
      expect(fetched.statementDay).toBeNull();
      expect(fetched.paymentDay).toBeNull();
      expect(fetched.apr).toBeNull();
      expect(fetched.interestFreeMonths).toBe(0);
    });

    it('responds 404 for an account that is not a credit card', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ accountCategory: ACCOUNT_CATEGORIES.general }),
        raw: true,
      });

      const res = await helpers.upsertCreditCardDetails({ accountId: account.id, payload: { statementDay: 10 } });

      expect(res.statusCode).toBe(404);
    });

    it("responds 404 for another user's credit card and leaves it untouched", async () => {
      const otherUser = await helpers.signUpSecondUser();
      const foreignCard = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: async () => {
          await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY_CODE });
          return createCard({});
        },
      });

      const res = await helpers.upsertCreditCardDetails({ accountId: foreignCard.id, payload: { statementDay: 10 } });
      expect(res.statusCode).toBe(404);

      const ownerView = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: () => helpers.getCreditCardDetails({ accountId: foreignCard.id, raw: true }),
      });
      expect(ownerView.statementDay).toBeNull();
    });

    it('is removed together with the card account', async () => {
      const card = await createCard({});
      await helpers.upsertCreditCardDetails({ accountId: card.id, payload: { statementDay: 10 }, raw: true });

      expect(await CreditCardDetails.count({ where: { accountId: card.id } })).toBe(1);

      await helpers.deleteAccount({ id: card.id, raw: true });

      expect(await CreditCardDetails.count({ where: { accountId: card.id } })).toBe(0);
    });
  });
});
