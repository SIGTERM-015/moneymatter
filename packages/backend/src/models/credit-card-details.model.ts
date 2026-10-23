import { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Accounts from '@models/accounts.model';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

/**
 * 1:1 sidecar on a credit-card `Accounts` row. The account keeps the balance (owed
 * amount, stored negative), the credit limit and the currency; this row only holds
 * the card's billing terms.
 */
@Table({
  tableName: 'CreditCardDetails',
  timestamps: true,
  freezeTableName: true,
})
export default class CreditCardDetails extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Accounts)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
  })
  accountId!: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.SMALLINT,
    allowNull: true,
  })
  statementDay!: number | null;

  @Column({
    type: DataType.SMALLINT,
    allowNull: true,
  })
  paymentDay!: number | null;

  // Postgres returns DECIMAL columns as strings; parse at the model boundary
  // so every consumer sees a number and no call site needs its own `Number()`.
  @Column({
    type: DataType.DECIMAL(7, 4),
    allowNull: true,
  })
  get apr(): number | null {
    const value = this.getDataValue('apr');
    return value === null || value === undefined ? null : Number(value);
  }
  set apr(val: number | string | null) {
    this.setDataValue('apr', typeof val === 'number' ? val.toFixed(4) : val);
  }

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  interestFreeMonths!: number;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Accounts, { foreignKey: 'accountId' })
  account!: Accounts;

  @BelongsTo(() => Users)
  user!: Users;
}
