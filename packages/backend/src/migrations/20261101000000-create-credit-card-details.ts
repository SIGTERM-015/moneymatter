import { DataTypes, QueryInterface } from 'sequelize';

/**
 * `CreditCardDetails`: 1:1 sidecar to a credit-card `Accounts` row (statement and
 * payment day, APR, interest-free months). The Account still owns the balance (what
 * is owed, stored negative), the credit limit and the currency. Ranges are enforced
 * by CHECK constraints as well as the API schema, so no writer can store a day 0 or
 * a negative APR.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'CreditCardDetails',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          accountId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
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
          statementDay: {
            type: DataTypes.SMALLINT,
            allowNull: true,
            comment: 'Day of month the statement closes, 1-31; consumers clamp to the last day of short months',
          },
          paymentDay: {
            type: DataTypes.SMALLINT,
            allowNull: true,
            comment: 'Day of month the statement is due, 1-31; consumers clamp to the last day of short months',
          },
          apr: {
            type: DataTypes.DECIMAL(7, 4),
            allowNull: true,
            comment: 'APR as percent, 0-100; e.g. 19.9900 for 19.99%',
          },
          interestFreeMonths: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
        },
        { transaction },
      );

      await queryInterface.addIndex('CreditCardDetails', ['userId'], { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE "CreditCardDetails"
           ADD CONSTRAINT "CreditCardDetails_statementDay_range" CHECK ("statementDay" BETWEEN 1 AND 31),
           ADD CONSTRAINT "CreditCardDetails_paymentDay_range" CHECK ("paymentDay" BETWEEN 1 AND 31),
           ADD CONSTRAINT "CreditCardDetails_apr_range" CHECK ("apr" BETWEEN 0 AND 100),
           ADD CONSTRAINT "CreditCardDetails_interestFreeMonths_range" CHECK ("interestFreeMonths" >= 0);`,
        { transaction },
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('CreditCardDetails');
  },
};
