import { CARD_INSTALLMENT_STATUSES, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import CardInstallmentPlans from '@models/card-installment-plans.model';
import Transactions from '@models/transactions.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

/** One monthly charge of a deferred card purchase: the amount the bank bills that month. */
@Table({
  tableName: 'CardInstallments',
  timestamps: true,
  freezeTableName: true,
})
export default class CardInstallments extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => CardInstallmentPlans)
  @Column({ type: DataType.UUID, allowNull: false })
  planId!: RecordId;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  dueMonth!: string;

  @MoneyField({ storage: 'cents' })
  declare amount: Money;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: CARD_INSTALLMENT_STATUSES.pending })
  status!: CARD_INSTALLMENT_STATUSES;

  /** Card-side leg of the transfer that pays this installment, or is proposed to. */
  @ForeignKey(() => Transactions)
  @Column({ type: DataType.UUID, allowNull: true })
  paidTransactionId!: RecordId | null;

  @Column({ type: DataType.DATE, allowNull: true })
  paidAt!: Date | null;

  /** Transfer the user rejected as payment of this installment; matching skips it from then on. */
  @ForeignKey(() => Transactions)
  @Column({ type: DataType.UUID, allowNull: true })
  rejectedTransactionId!: RecordId | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => CardInstallmentPlans, { foreignKey: 'planId', onDelete: 'CASCADE' })
  plan!: CardInstallmentPlans;

  @BelongsTo(() => Transactions, { foreignKey: 'paidTransactionId', onDelete: 'SET NULL' })
  paidTransaction!: Transactions | null;

  @BelongsTo(() => Transactions, { foreignKey: 'rejectedTransactionId', onDelete: 'SET NULL' })
  rejectedTransaction!: Transactions | null;
}
