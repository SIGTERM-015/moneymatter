import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import { getAggregatedBalanceHistory } from '@services/stats/get-balance-history';
import { Op } from 'sequelize';

/**
 * Credit-card slice of the combined history: the cards' own balance series and the
 * part of the credit-limit adjustment that belongs to them, so the caller can take
 * both out of the accounts bucket without changing the total.
 *
 * Cards have real dated transactions, so the series is filled exactly like the
 * accounts one (earliest record back-fills); loans need an immutable opening balance
 * instead, which does not apply here.
 */
export const calculateCardsBalanceHistory = async ({
  userId,
  from,
  to,
  includeCreditLimit,
}: {
  userId: number;
  from: string;
  to: string;
  includeCreditLimit: boolean;
}): Promise<{ cardsBalanceByDate: Map<string, number>; cardsCreditLimitCents: number }> => {
  const [history, cardsCreditLimitCents] = await Promise.all([
    getAggregatedBalanceHistory({
      userId,
      accountScope: 'owned',
      from,
      to,
      categoryFilter: { only: [ACCOUNT_CATEGORIES.creditCard] },
    }),
    includeCreditLimit ? sumCardsCreditLimitCents({ userId }) : Promise.resolve(0),
  ]);

  return {
    cardsBalanceByDate: new Map(history.map((item) => [item.date, item.amount])),
    cardsCreditLimitCents,
  };
};

/** Same account selection as `getCreditLimitCentsByAccount` for the owned scope, narrowed to cards. */
const sumCardsCreditLimitCents = async ({ userId }: { userId: number }): Promise<number> => {
  const cards = await Accounts.findAll({
    where: {
      userId,
      excludeFromStats: false,
      creditLimit: { [Op.gt]: 0 },
      accountCategory: ACCOUNT_CATEGORIES.creditCard,
    },
    attributes: ['id', 'refCreditLimit'],
  });

  return cards.reduce((sum, card) => sum + card.refCreditLimit.toCents(), 0);
};
