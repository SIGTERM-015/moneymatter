import { CARD_INSTALLMENT_PLAN_STATUSES, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import Accounts from '@models/accounts.model';
import CardInstallments from '@models/card-installments.model';
import Transactions from '@models/transactions.model';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from 'sequelize-typescript';

/**
 * A deferred purchase on a credit-card account. The purchase is already an expense on the
 * card, so the balance holds the full principal; `installments` only schedule when the bank
 * charges it.
 */
@Table({
  tableName: 'CardInstallmentPlans',
  timestamps: true,
  freezeTableName: true,
})
export default class CardInstallmentPlans extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Accounts)
  @Column({ type: DataType.UUID, allowNull: false })
  accountId!: RecordId;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(200), allowNull: false })
  title!: string;

  @MoneyField({ storage: 'cents' })
  declare principal: Money;

  @Column({ type: DataType.INTEGER, allowNull: false })
  installmentsCount!: number;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  firstDueMonth!: string;

  // Postgres returns DECIMAL columns as strings; parse at the model boundary.
  @Column({ type: DataType.DECIMAL(7, 4), allowNull: true })
  get apr(): number | null {
    const value = this.getDataValue('apr');
    return value === null || value === undefined ? null : Number(value);
  }
  set apr(val: number | string | null) {
    this.setDataValue('apr', typeof val === 'number' ? val.toFixed(4) : val);
  }

  @Column({ type: DataType.INTEGER, allowNull: true })
  interestFreeMonths!: number | null;

  @ForeignKey(() => Transactions)
  @Column({ type: DataType.UUID, allowNull: true })
  purchaseTransactionId!: RecordId | null;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: CARD_INSTALLMENT_PLAN_STATUSES.active })
  status!: CARD_INSTALLMENT_PLAN_STATUSES;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Accounts, { foreignKey: 'accountId' })
  account!: Accounts;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Transactions, { foreignKey: 'purchaseTransactionId', onDelete: 'SET NULL' })
  purchaseTransaction!: Transactions | null;

  @HasMany(() => CardInstallments, { foreignKey: 'planId', onDelete: 'CASCADE' })
  installments!: CardInstallments[];
}
