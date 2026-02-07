import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { PublishController } from '../controllers/PublishController';
import { ConsumerController } from '../controllers/ConsumerController';
import { AdminController } from '../controllers/AdminController';

export const createRoutes = (logPipe: any) => {
  const router = express.Router();
  const publishCtrl = new PublishController(logPipe);
  const consumerCtrl = new ConsumerController(logPipe);
  const adminCtrl = new AdminController(logPipe);

  // producer routes (publish events + cart examples)
  router.post('/publish', asyncHandler(publishCtrl.publish.bind(publishCtrl)));
  router.post('/api/cart/add', asyncHandler(publishCtrl.addToCart.bind(publishCtrl)));
  router.post('/api/cart/remove', asyncHandler(publishCtrl.removeFromCart.bind(publishCtrl)));
  router.post('/api/checkout', asyncHandler(publishCtrl.checkout.bind(publishCtrl)));
  router.post('/api/payment/process', asyncHandler(publishCtrl.processPayment.bind(publishCtrl)));
  router.post('/api/notify/email', asyncHandler(publishCtrl.sendEmailNotification.bind(publishCtrl)));

  // consumer routes
  router.get('/consume', asyncHandler(consumerCtrl.consume.bind(consumerCtrl)));
  router.get('/offset', asyncHandler(consumerCtrl.getOffset.bind(consumerCtrl)));
  router.post('/commit-offset', asyncHandler(consumerCtrl.commitOffset.bind(consumerCtrl)));

  // admin/metadata routes
  router.get('/status', asyncHandler(adminCtrl.status.bind(adminCtrl)));
  router.get('/topics', asyncHandler(adminCtrl.topics.bind(adminCtrl)));
  router.get('/read', asyncHandler(adminCtrl.read.bind(adminCtrl)));
  // stats: who produced/consumed, groups, reads, date-wise etc
  router.get('/topics/:topic/stats', asyncHandler(adminCtrl.topicStats.bind(adminCtrl)));
  // consumers list/stats (multi-topic progress, event links, deps)
  router.get('/consumers', asyncHandler(adminCtrl.consumers.bind(adminCtrl)));
  // groups list/stats (consumers/topics/progress)
  router.get('/groups', asyncHandler(adminCtrl.groups.bind(adminCtrl)));

  return router;
};
