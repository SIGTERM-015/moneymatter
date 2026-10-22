# Credit cards (fork feature spec)

Fork-only. Goal: a credit card is more than a plain account. Everything is additive and lives in new
files wherever possible so rebasing on upstream `dev` stays cheap.

## Decisions (do not relitigate)

- A card stays an `accounts` row with `accountCategory = 'credit-card'`. It is NOT converted into a `loan`:
  the loan model only accepts principal payments and forbids purchases and overpayment.
- Balance convention for cards in this fork: the balance is what is owed, stored negative (`-792` = owes 792).
  `Include credit limits in balance` stays OFF. Used credit = `max(-balance, 0)` (existing `computeCreditUsed`),
  available credit = `creditLimit - used`.
- Interest is only estimated and displayed, never added to the balance automatically.
- The monthly card payment is an ordinary manual transfer from a bank account to the card. Automations cannot
  create transfers, so nothing automatic is built for it.
- Money: follow the repo `Money` convention (cents in DB, decimals in API/frontend).

## F1. Card details, own balance bucket, exclusion from totals

- New sidecar table `CreditCardDetails` (1:1 on `accountId`, UNIQUE): `statementDay` (1-31, nullable),
  `paymentDay` (1-31, nullable), `apr` (DECIMAL(7,4), 0..100, nullable), `interestFreeMonths` (int >= 0, default 0).
- Endpoints (new route/controller/service files): `GET /accounts/:id/credit-card` (details + computed
  `creditLimit`, `used`, `available`), `PUT /accounts/:id/credit-card` (upsert). Only valid for
  `credit-card` accounts owned by the user. e2e tests required (happy path, empty state, errors).
- Balance trend / net worth: credit-card accounts get their own bucket `cardsBalance` in
  `get-combined-balance-history` (not in `accountsBalance`), the same way loans are separated. `totalBalance`
  still sums everything. Frontend: new `includeCardsInTotal` toggle (default on) in the Balance trend settings
  popover and the Net Worth widget, same pattern as `includeLoansInTotal`; add a `Cards` option to the line
  selector. Net Worth History keeps classifying cards as liabilities.
- Account page for a card: show used / available / limit and the details form (statement day, payment day, APR,
  interest-free months). i18n keys in `en` and `uk` only, via the `i18n-editor` agent rules in CLAUDE.md.

## F2. Deferred purchases (installments) on a card

- Tables: `CardInstallmentPlans` (`id`, `accountId` card, `userId`, `title`, `principal` Money, `installmentsCount`,
  `firstDueMonth` DATE (first day of month), `apr` nullable, `interestFreeMonths` nullable,
  `purchaseTransactionId` nullable FK to the original card expense, `status` active|completed) and
  `CardInstallments` (`id`, `planId`, `dueMonth` DATE, `amount` Money = the real amount the bank charges that
  month, `paidTransactionId` nullable, `paidAt` nullable, `status` pending|proposed|paid).
- The purchase itself is already an expense on the card (the balance already contains the full principal).
  Installments are a billing schedule only: paying one never creates a card expense.
- Estimated interest per plan = `sum(amount) - principal` (display only).
- Matching: when a transfer INTO a card account is created or edited, compute `due(month)` = sum of the
  `pending` installment amounts whose `dueMonth` <= the transfer month for that card. If the transfer amount
  equals `due(month)` (and it is > 0), mark those installments `paid` and link the transaction.
  Ambiguity: if the card's non-deferred statement spend for that period equals the same amount, mark them
  `proposed` instead and expose `POST /credit-card/installments/:id/confirm` and `/reject`. If the amount
  matches nothing, the transfer is an ordinary payment and nothing changes. Deleting/editing the transfer
  reverts the installments to `pending`. Matching must be idempotent.
- Statement spend (for the monthly summary) = card expenses between the previous and the current statement day
  minus principal of plans whose `purchaseTransactionId` falls in that window.
- Endpoints (new files): CRUD for plans under `/accounts/:id/credit-card/installments` (create generates the
  rows from an amounts array or from `principal`/`count`/`apr` with an equal split), list, and a monthly
  summary `GET /accounts/:id/credit-card/summary?month=YYYY-MM` returning `{ installmentsDue, statementSpend,
  expectedTotal }`. e2e tests through HTTP only.
- Frontend: an "Installments" section on the card page: list of plans with progress, a create form
  (title, principal, count, per-installment amounts editable, optional link to the purchase transaction,
  optional APR / interest-free months) and the monthly summary, plus the confirm button for `proposed`.

## F3. Bank sync (Enable Banking)

- In `services/bank-data-providers/enablebanking/`, read `cash_account_type`: `CARD` maps to
  `accountCategory credit-card` with `credit_limit`; the balance sign must produce "owed = negative".
  `LOAN` accounts stay general accounts (loans have a dedicated flow and cannot be created by sync).
- This cannot be verified without the user's real BBVA connection. Cover it with unit tests on fixtures built
  from the documented API shapes and mark it clearly as unverified in the PR.

## Rebase hygiene

Migrations are named with a timestamp later than upstream's latest (check `git ls-tree` of upstream/dev);
put code in new files; keep edits to shared files (`get-combined-balance-history`, `balance-trend.vue`,
`net-worth-composition.ts`, `accounts.model.ts`) to the minimum lines.
