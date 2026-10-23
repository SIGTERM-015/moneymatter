import { CARD_INSTALLMENT_STATUSES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { addMonths, format, getDaysInMonth, parse } from 'date-fns';

/** `YYYY-MM` of a UTC instant. Card statements and installment months are compared on UTC days. */
const toUtcMonth = ({ date }: { date: Date }): string => date.toISOString().slice(0, 7);

const HOUR_MS = 3_600_000;
// Every civil time zone lies between UTC-12 and UTC+14.
const MIN_UTC_OFFSET_HOURS = -12;
const MAX_UTC_OFFSET_HOURS = 14;

/**
 * Months the instant may fall in for the person who entered it. The server knows no user time
 * zone, so a payment made late on the 31st in the Americas is already the 1st in UTC; every
 * month it can be in locally is a candidate, earliest first.
 */
export const candidateLocalMonths = ({ date }: { date: Date }): string[] => [
  ...new Set([
    toUtcMonth({ date: new Date(date.getTime() + MIN_UTC_OFFSET_HOURS * HOUR_MS) }),
    toUtcMonth({ date }),
    toUtcMonth({ date: new Date(date.getTime() + MAX_UTC_OFFSET_HOURS * HOUR_MS) }),
  ]),
];

/** `YYYY-MM` → first day of that month as the DATEONLY string the columns store. */
export const monthToDate = ({ month }: { month: string }): string => `${month}-01`;

/** DATEONLY `YYYY-MM-DD` → `YYYY-MM`. */
export const dateToMonth = ({ date }: { date: string }): string => date.slice(0, 7);

/** `YYYY-MM` plus `offset` months. */
const shiftMonth = ({ month, offset }: { month: string; offset: number }): string =>
  format(addMonths(parse(month, 'yyyy-MM', new Date(2000, 0, 1)), offset), 'yyyy-MM');

/** Installments scheduled from `firstDueMonth`, one per month. */
export const buildInstallmentMonths = ({ firstDueMonth, count }: { firstDueMonth: string; count: number }) =>
  Array.from({ length: count }, (_, index) => shiftMonth({ month: firstDueMonth, offset: index }));

const utcDay = ({ month, day }: { month: string; day: number }) => {
  const [year = 0, monthIndex = 1] = month.split('-').map(Number);
  const daysInMonth = getDaysInMonth(new Date(year, monthIndex - 1, 1));
  return Date.UTC(year, monthIndex - 1, Math.min(day, daysInMonth));
};

const DAY_MS = 86_400_000;

/**
 * The statement that closes in `month`: from the day after the previous close up to the close
 * day, both inclusive, on UTC days. A day past the end of a short month closes on its last day.
 * Without a statement day the statement is the calendar month.
 */
export const statementWindow = ({ statementDay, month }: { statementDay: number | null; month: string }) => {
  const closeDay = statementDay ?? 31;
  const close = utcDay({ month, day: closeDay });
  const previousClose = utcDay({ month: shiftMonth({ month, offset: -1 }), day: closeDay });

  return {
    from: new Date(previousClose + DAY_MS),
    // Exclusive upper bound: the start of the day after the close.
    toExclusive: new Date(close + DAY_MS),
  };
};

/**
 * Month of the latest statement already closed when `date` starts: the statement a card payment
 * made that day settles. A statement is closed once its close day is over.
 */
export const lastClosedStatementMonth = ({ statementDay, date }: { statementDay: number | null; date: Date }) => {
  const month = toUtcMonth({ date });
  const { toExclusive } = statementWindow({ statementDay, month });
  return date.getTime() >= toExclusive.getTime() ? month : shiftMonth({ month, offset: -1 });
};

/** Last inclusive day of a statement window as `YYYY-MM-DD`. */
export const windowLastDay = ({ toExclusive }: { toExclusive: Date }) =>
  new Date(toExclusive.getTime() - DAY_MS).toISOString().slice(0, 10);

interface DueCandidate {
  dueMonth: string;
  amount: Money;
  status: CARD_INSTALLMENT_STATUSES;
}

/** `due(month)`: the pending installments scheduled up to `month`, and their sum. */
export const selectDueInstallments = <T extends DueCandidate>({
  installments,
  month,
}: {
  installments: T[];
  month: string;
}) => {
  const due = installments.filter(
    (installment) => installment.status === CARD_INSTALLMENT_STATUSES.pending && installment.dueMonth <= month,
  );
  return { due, total: Money.sum(due.map((installment) => installment.amount)) };
};

type CardPaymentMatch = 'none' | 'paid' | 'proposed';

/**
 * How a transfer into a card settles its installments. It settles them only when it equals
 * `due(month)` exactly; when the statement it pays (the latest one closed before it) has that
 * same non-deferred spend, the transfer could equally be the statement payment, so the match
 * waits for the user.
 */
export const classifyCardPayment = ({
  amount,
  due,
  statementSpend,
}: {
  amount: Money;
  due: Money;
  statementSpend: Money;
}): CardPaymentMatch => {
  if (!due.isPositive() || !amount.equals(due)) return 'none';
  return statementSpend.equals(amount) ? 'proposed' : 'paid';
};
