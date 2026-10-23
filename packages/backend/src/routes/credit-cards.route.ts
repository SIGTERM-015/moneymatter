import createInstallmentPlan from '@controllers/credit-cards/create-installment-plan';
import deleteInstallmentPlan from '@controllers/credit-cards/delete-installment-plan';
import getCardMonthlySummary from '@controllers/credit-cards/get-card-monthly-summary';
import getCreditCardDetails from '@controllers/credit-cards/get-credit-card-details';
import getInstallmentPlans from '@controllers/credit-cards/get-installment-plans';
import updateInstallmentPlan from '@controllers/credit-cards/update-installment-plan';
import upsertCreditCardDetails from '@controllers/credit-cards/upsert-credit-card-details';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { Router } from 'express';

/** Mounted under `/accounts`: card details and installment plans live on the card's own account id. */
const router = Router({});

router.use(authenticateSession);

router.get('/:id/credit-card', getCreditCardDetails);
router.put('/:id/credit-card', checkBaseCurrencyLock, upsertCreditCardDetails);

router.get('/:id/credit-card/summary', getCardMonthlySummary);
router.get('/:id/credit-card/installments', getInstallmentPlans);
router.post('/:id/credit-card/installments', checkBaseCurrencyLock, createInstallmentPlan);
router.patch('/:id/credit-card/installments/:planId', checkBaseCurrencyLock, updateInstallmentPlan);
router.delete('/:id/credit-card/installments/:planId', checkBaseCurrencyLock, deleteInstallmentPlan);

export default router;
