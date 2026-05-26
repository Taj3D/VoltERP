import { db } from '../src/lib/db';

async function main() {
  const expenses = await db.expense.findMany({ orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < expenses.length; i++) {
    await db.expense.update({ where: { id: expenses[i].id }, data: { expenseCode: `EXP-${String(i+1).padStart(5,'0')}` } });
  }
  console.log(`Backfilled ${expenses.length} expenses`);
  
  const incomes = await db.income.findMany({ orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < incomes.length; i++) {
    await db.income.update({ where: { id: incomes[i].id }, data: { incomeCode: `INC-${String(i+1).padStart(5,'0')}` } });
  }
  console.log(`Backfilled ${incomes.length} incomes`);
  
  const collections = await db.cashCollection.findMany({ orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < collections.length; i++) {
    await db.cashCollection.update({ where: { id: collections[i].id }, data: { collectionCode: `COL-${String(i+1).padStart(5,'0')}` } });
  }
  console.log(`Backfilled ${collections.length} collections`);
  
  const deliveries = await db.cashDelivery.findMany({ orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < deliveries.length; i++) {
    await db.cashDelivery.update({ where: { id: deliveries[i].id }, data: { deliveryCode: `DEL-${String(i+1).padStart(5,'0')}` } });
  }
  console.log(`Backfilled ${deliveries.length} deliveries`);
  
  const bankTxns = await db.bankTransaction.findMany({ orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < bankTxns.length; i++) {
    await db.bankTransaction.update({ where: { id: bankTxns[i].id }, data: { transactionCode: `BTX-${String(i+1).padStart(5,'0')}` } });
  }
  console.log(`Backfilled ${bankTxns.length} bank transactions`);
  
  const banks = await db.bank.findMany();
  for (const bank of banks) {
    await db.bank.update({ where: { id: bank.id }, data: { currentBalance: bank.openingBalance } });
  }
  console.log(`Updated ${banks.length} bank balances`);
}
main().catch(console.error);
