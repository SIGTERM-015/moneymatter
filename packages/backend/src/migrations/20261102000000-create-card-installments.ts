import { DataTypes, QueryInterface } from 'sequelize';

/**
 * Deferred purchases on a credit card. `CardInstallmentPlans` is the purchase (already an
 * expense on the card, so the balance holds the full principal) and `CardInstallments` is when
 * the bank charges it: one row per month with the amount the bank really bills. Paying an
 * installment is an ordinary transfer into the card that the matcher links here; nothing in
 * these tables moves a balance.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'CardInstallmentPlans',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          accountId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          title: { type: DataTypes.STRING(200), allowNull: false },
          principal: { type: DataTypes.BIGINT, allowNull: false, comment: 'Deferred purchase amount in cents' },
          installmentsCount: { type: DataTypes.INTEGER, allowNull: false },
          firstDueMonth: { type: DataTypes.DATEONLY, allowNull: false, comment: 'First day of the first billed month' },
          apr: { type: DataTypes.DECIMAL(7, 4), allowNull: true, comment: 'APR as percent, 0-100' },
          interestFreeMonths: { type: DataTypes.INTEGER, allowNull: true },
          purchaseTransactionId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false },
        },
        { transaction },
      );

      await queryInterface.addIndex('CardInstallmentPlans', ['accountId'], { transaction });
      await queryInterface.addIndex('CardInstallmentPlans', ['userId'], { transaction });
      // A purchase is deferred once; a second plan on it would bill it twice.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "CardInstallmentPlans_purchaseTransactionId_unique"
           ON "CardInstallmentPlans" ("purchaseTransactionId") WHERE "purchaseTransactionId" IS NOT NULL;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "CardInstallmentPlans"
           ADD CONSTRAINT "CardInstallmentPlans_principal_positive" CHECK ("principal" > 0),
           ADD CONSTRAINT "CardInstallmentPlans_installmentsCount_range" CHECK ("installmentsCount" BETWEEN 1 AND 120),
           ADD CONSTRAINT "CardInstallmentPlans_firstDueMonth_first_day" CHECK (EXTRACT(DAY FROM "firstDueMonth") = 1),
           ADD CONSTRAINT "CardInstallmentPlans_apr_range" CHECK ("apr" BETWEEN 0 AND 100),
           ADD CONSTRAINT "CardInstallmentPlans_interestFreeMonths_range" CHECK ("interestFreeMonths" >= 0),
           ADD CONSTRAINT "CardInstallmentPlans_status_values" CHECK ("status" IN ('active', 'completed'));`,
        { transaction },
      );

      await queryInterface.createTable(
        'CardInstallments',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          planId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'CardInstallmentPlans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          dueMonth: { type: DataTypes.DATEONLY, allowNull: false, comment: 'First day of the billed month' },
          amount: { type: DataTypes.BIGINT, allowNull: false, comment: 'What the bank charges that month, in cents' },
          status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
          paidTransactionId: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'Card-side leg of the transfer that pays (or is proposed to pay) this installment',
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          paidAt: { type: DataTypes.DATE, allowNull: true },
          rejectedTransactionId: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'Transfer the user said is not this installment, so matching never proposes it again',
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false },
        },
        { transaction },
      );

      await queryInterface.addIndex('CardInstallments', ['planId', 'dueMonth'], { unique: true, transaction });
      await queryInterface.addIndex('CardInstallments', ['paidTransactionId'], { transaction });
      await queryInterface.addIndex('CardInstallments', ['rejectedTransactionId'], { transaction });

      // A pending installment carries no payment; the reverse is not enforced because deleting
      // a paying transaction outside the app's revert path nulls the link through the FK.
      await queryInterface.sequelize.query(
        `ALTER TABLE "CardInstallments"
           ADD CONSTRAINT "CardInstallments_amount_positive" CHECK ("amount" > 0),
           ADD CONSTRAINT "CardInstallments_dueMonth_first_day" CHECK (EXTRACT(DAY FROM "dueMonth") = 1),
           ADD CONSTRAINT "CardInstallments_status_values" CHECK ("status" IN ('pending', 'proposed', 'paid')),
           ADD CONSTRAINT "CardInstallments_pending_unlinked"
             CHECK ("status" <> 'pending' OR ("paidTransactionId" IS NULL AND "paidAt" IS NULL)),
           ADD CONSTRAINT "CardInstallments_paid_dated" CHECK ("status" <> 'paid' OR "paidAt" IS NOT NULL);`,
        { transaction },
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('CardInstallments', { transaction });
      await queryInterface.dropTable('CardInstallmentPlans', { transaction });
    });
  },
};
