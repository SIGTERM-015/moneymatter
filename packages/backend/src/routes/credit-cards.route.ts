import getCreditCardDetails from '@controllers/credit-cards/get-credit-card-details';
import upsertCreditCardDetails from '@controllers/credit-cards/upsert-credit-card-details';
import { authenticateSession } from '@middlewares/better-auth';
import { Router } from 'express';

/** Mounted under `/accounts`: card details live on the card's own account id. */
const router = Router({});

router.use(authenticateSession);

router.get('/:id/credit-card', getCreditCardDetails);
router.put('/:id/credit-card', upsertCreditCardDetails);

export default router;
