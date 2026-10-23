import confirmInstallment from '@controllers/credit-cards/confirm-installment';
import rejectInstallment from '@controllers/credit-cards/reject-installment';
import updateInstallment from '@controllers/credit-cards/update-installment';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { Router } from 'express';

/** Mounted under `/credit-card/installments`: a single installment, addressed by its own id. */
const router = Router({});

router.use(authenticateSession);

router.patch('/:id', checkBaseCurrencyLock, updateInstallment);
router.post('/:id/confirm', checkBaseCurrencyLock, confirmInstallment);
router.post('/:id/reject', checkBaseCurrencyLock, rejectInstallment);

export default router;
