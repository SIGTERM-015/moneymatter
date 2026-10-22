import { ACCOUNT_CATEGORIES, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Accounts from '@models/accounts.model';
import * as helpers from '@tests/helpers';
import { useSelfHost } from '@tests/helpers/self-host';
import { MOCK_IDENTIFICATION_HASH_1, getMockedAccountDetails } from '@tests/mocks/enablebanking/data';
import { HttpResponse, http } from 'msw';

useSelfHost();

type AmountPayload = { amount: string; currency: string };
type BalancePayload = { balance_type: string; balance_amount: AmountPayload };

/**
 * Connects mock account 1 after overriding what the bank reports for it:
 * its `cash_account_type`, `credit_limit` and balances (ISO 20022 shapes from the
 * Enable Banking API reference).
 */
async function connectMockedAccount({
  cashAccountType,
  creditLimit,
  balances,
  linkTo,
}: {
  cashAccountType: string;
  creditLimit?: AmountPayload;
  balances: BalancePayload[];
  /** Links this existing system account instead of creating a new account from the bank one. */
  linkTo?: string;
}) {
  const connectResult = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
    credentials: helpers.enablebanking.mockCredentials(),
    raw: true,
  });
  const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);
  await helpers.makeRequest({
    method: 'post',
    url: '/bank-data-providers/enablebanking/oauth-callback',
    payload: { connectionId: connectResult.connectionId, code: helpers.enablebanking.mockAuthCode, state },
  });

  global.mswMockServer.use(
    http.get('https://api.enablebanking.com/accounts/:accountId/details', ({ params }) => {
      const details = getMockedAccountDetails(params.accountId as string);
      return HttpResponse.json({
        ...details,
        cash_account_type: cashAccountType,
        credit_limit: creditLimit,
      });
    }),
    http.get('https://api.enablebanking.com/accounts/:accountId/balances', () => HttpResponse.json({ balances })),
  );

  const external = await helpers.bankDataProviders.listExternalAccounts({
    connectionId: connectResult.connectionId,
    raw: true,
  });
  const externalAccount = external.accounts.find((a) => a.externalId === MOCK_IDENTIFICATION_HASH_1)!;

  let accountId: string;
  if (linkTo) {
    await helpers.linkAccountToBankConnection({
      id: linkTo,
      connectionId: connectResult.connectionId,
      externalAccountId: MOCK_IDENTIFICATION_HASH_1,
      raw: true,
    });
    accountId = linkTo;
  } else {
    const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId: connectResult.connectionId,
      accountExternalIds: [MOCK_IDENTIFICATION_HASH_1],
      raw: true,
    });
    accountId = syncedAccounts[0]!.id;
  }
  const account = await helpers.getAccount({ id: accountId, raw: true });

  return { connectionId: connectResult.connectionId, externalAccount, account };
}

describe('Enable Banking account types (cash_account_type)', () => {
  describe('CARD accounts', () => {
    const limit = { amount: '1500.00', currency: 'EUR' };

    it('connects as a credit card with the bank limit and the booked balance as owed (negative)', async () => {
      const { externalAccount, account } = await connectMockedAccount({
        cashAccountType: 'CARD',
        creditLimit: limit,
        balances: [
          { balance_type: 'CLBD', balance_amount: { amount: '792.00', currency: 'EUR' } },
          { balance_type: 'ITAV', balance_amount: { amount: '708.00', currency: 'EUR' } },
        ],
      });

      expect(externalAccount.type).toBe('credit');
      expect(externalAccount.balance).toBe(-792);
      expect(account.accountCategory).toBe(ACCOUNT_CATEGORIES.creditCard);
      expect(account.creditLimit).toBe(1500);
      expect(account.currentBalance).toBe(-792);
      expect(account.initialBalance).toBe(-792);
    });

    it('keeps a negative booked balance as it is', async () => {
      const { account } = await connectMockedAccount({
        cashAccountType: 'CARD',
        creditLimit: limit,
        balances: [{ balance_type: 'ITBD', balance_amount: { amount: '-120.50', currency: 'EUR' } }],
      });

      expect(account.accountCategory).toBe(ACCOUNT_CATEGORIES.creditCard);
      expect(account.currentBalance).toBe(-120.5);
    });

    it('derives the debt as limit minus available when the bank only reports an available balance', async () => {
      const { account } = await connectMockedAccount({
        cashAccountType: 'CARD',
        creditLimit: limit,
        balances: [{ balance_type: 'ITAV', balance_amount: { amount: '708.00', currency: 'EUR' } }],
      });

      expect(account.currentBalance).toBe(-792);
    });

    it('keeps the owed-is-negative balance after a later sync', async () => {
      const { connectionId, account } = await connectMockedAccount({
        cashAccountType: 'CARD',
        creditLimit: limit,
        balances: [
          { balance_type: 'CLBD', balance_amount: { amount: '792.00', currency: 'EUR' } },
          { balance_type: 'ITAV', balance_amount: { amount: '708.00', currency: 'EUR' } },
        ],
      });

      global.mswMockServer.use(
        http.get('https://api.enablebanking.com/accounts/:accountId/balances', () =>
          HttpResponse.json({
            balances: [
              { balance_type: 'CLBD', balance_amount: { amount: '850.00', currency: 'EUR' } },
              { balance_type: 'ITAV', balance_amount: { amount: '650.00', currency: 'EUR' } },
            ],
          }),
        ),
      );
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId: account.id, raw: true });
      await helpers.bankDataProviders.waitForAccountsSyncToSettle();

      const synced = await helpers.getAccount({ id: account.id, raw: true });
      expect(synced.currentBalance).toBe(-850);
    });

    it('links an existing account to a card with the limit adopted and the balance as owed, not shifted by the limit', async () => {
      const systemAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ currencyCode: 'EUR' }),
        raw: true,
      });

      const { account } = await connectMockedAccount({
        cashAccountType: 'CARD',
        creditLimit: limit,
        balances: [
          { balance_type: 'CLBD', balance_amount: { amount: '792.00', currency: 'EUR' } },
          { balance_type: 'ITAV', balance_amount: { amount: '708.00', currency: 'EUR' } },
        ],
        linkTo: systemAccount.id,
      });

      expect(account.creditLimit).toBe(1500);
      expect(account.currentBalance).toBe(-792);
    });

    it('imports a card without a reported limit as a credit card with zero limit', async () => {
      const { account } = await connectMockedAccount({
        cashAccountType: 'CARD',
        balances: [{ balance_type: 'ITBD', balance_amount: { amount: '-30.00', currency: 'EUR' } }],
      });

      expect(account.accountCategory).toBe(ACCOUNT_CATEGORIES.creditCard);
      expect(account.creditLimit).toBe(0);
      expect(account.currentBalance).toBe(-30);
    });
  });

  describe('non-card accounts', () => {
    it('imports a LOAN account as a general account flagged with its bank type, without creating a loan', async () => {
      const { externalAccount, account } = await connectMockedAccount({
        cashAccountType: 'LOAN',
        balances: [{ balance_type: 'ITBD', balance_amount: { amount: '-10000.00', currency: 'EUR' } }],
      });

      expect(externalAccount.type).toBe('debit');
      expect(account.accountCategory).toBe(ACCOUNT_CATEGORIES.general);
      expect(account.currentBalance).toBe(-10_000);

      const stored = await Accounts.findByPk(account.id);
      expect(stored!.externalData?.cashAccountType).toBe('LOAN');
    });

    it.each(['CACC', 'SVGS'])(
      'imports a %s account as a general account with the balance as reported',
      async (type) => {
        const { externalAccount, account } = await connectMockedAccount({
          cashAccountType: type,
          balances: [{ balance_type: 'ITBD', balance_amount: { amount: '250.00', currency: 'EUR' } }],
        });

        expect(externalAccount.type).toBe('debit');
        expect(account.accountCategory).toBe(ACCOUNT_CATEGORIES.general);
        expect(account.currentBalance).toBe(250);
      },
    );
  });
});
