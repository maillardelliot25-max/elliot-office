/**
 * AI Empire — Payment Webhooks (webhooks.js)
 * Owner: Elliot Maillard | Maillard AI
 *
 * Handles real-time payment notifications from:
 *   - PayPal (REST webhooks)
 *   - Wise (profile-level webhooks)
 *   - Gumroad (sale webhooks)
 *   - LemonSqueezy (order webhooks)
 *   - Stripe (future — ready to activate)
 *   - Manual income logging (POST /api/revenue/manual)
 *
 * Each webhook updates EmpireState.revenue and broadcasts to the dashboard live.
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const { v4: uuid } = require('uuid');

module.exports = function buildWebhookRouter(EmpireState, logger, io) {
  const router = express.Router();

  /* ===================== HELPERS ===================== */

  function recordRevenue({ stream, amount, description, source, meta = {} }) {
    const val = parseFloat(amount) || 0;
    if (val <= 0) return;

    // Update stream total
    if (!EmpireState.revenue[stream]) EmpireState.revenue[stream] = 0;
    EmpireState.revenue[stream] += val;
    EmpireState.revenueToday     = (EmpireState.revenueToday || 0) + val;

    // Append to history
    const entry = { id: uuid(), ts: Date.now(), stream, amount: val, description, source, meta };
    if (!EmpireState.revenueHistory) EmpireState.revenueHistory = [];
    EmpireState.revenueHistory.push(entry);
    if (EmpireState.revenueHistory.length > 2000) EmpireState.revenueHistory.shift();

    // Append to income log (persistent display on dashboard)
    if (!EmpireState.incomeLog) EmpireState.incomeLog = [];
    EmpireState.incomeLog.unshift(entry);
    if (EmpireState.incomeLog.length > 500) EmpireState.incomeLog.pop();

    const total = Object.values(EmpireState.revenue).reduce((a, b) => a + (b || 0), 0);

    // Broadcast to all connected dashboard clients
    io.emit('revenue:tick',     { ...EmpireState.revenue, total });
    io.emit('revenue:new_entry', entry);
    io.emit('activity', {
      type:    'success',
      message: `💰 +$${val.toFixed(2)} via ${source}: ${description}`,
    });

    logger.info(`[Webhook] Revenue recorded: $${val} from ${source} (${stream})`);
    return entry;
  }

  /* ===================== PAYPAL ===================== */
  /**
   * POST /webhooks/paypal
   * PayPal REST API webhook — PAYMENT.CAPTURE.COMPLETED
   * Set this URL in: PayPal Developer → Apps → Webhooks
   */
  router.post('/paypal', express.json(), (req, res) => {
    // Acknowledge immediately (PayPal requires fast 2xx)
    res.json({ received: true });

    const event    = req.body;
    const evtType  = event?.event_type;

    logger.info(`[PayPal Webhook] Event: ${evtType}`);

    if (['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.SALE.COMPLETED', 'INVOICING.INVOICE.PAID'].includes(evtType)) {
      const resource    = event.resource || {};
      const amountObj   = resource.amount || resource.invoice_amount || {};
      const amount      = parseFloat(amountObj.value || amountObj.total || 0);
      const currency    = amountObj.currency_code || amountObj.currency || 'USD';
      const description = resource.description || resource.invoice_number || `PayPal payment (${evtType})`;
      const stream      = detectStream(description);

      recordRevenue({ stream, amount, description, source: 'PayPal', meta: { currency, eventId: event.id } });
    }
  });

  /* ===================== WISE ===================== */
  /**
   * POST /webhooks/wise
   * Wise profile-level webhook — transfers#state-change
   * Register at: wise.com → Settings → Developer tools → Webhooks
   * Event: "transfers#state-change", watch for state: "outgoing_payment_sent"
   */
  router.post('/wise', express.json(), (req, res) => {
    res.json({ received: true });

    const event = req.body;

    // Verify signature if WISE_WEBHOOK_SECRET is set
    const secret = process.env.WISE_WEBHOOK_SECRET;
    if (secret) {
      const sig      = req.headers['x-signature-sha256'];
      const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('base64');
      if (sig !== expected) {
        logger.warn('[Wise Webhook] Signature mismatch — ignored');
        return;
      }
    }

    const evtType = event?.event_type;
    logger.info(`[Wise Webhook] Event: ${evtType}`);

    if (evtType === 'transfers#state-change') {
      const resource = event.data?.resource || {};
      const newState = resource.currentState || '';

      if (newState === 'outgoing_payment_sent' || newState === 'funds_refunded') {
        // This fires when YOU receive money (incoming)
        const amount      = parseFloat(resource.targetValue || resource.sourceValue || 0);
        const currency    = resource.targetCurrency || resource.sourceCurrency || 'USD';
        const description = resource.details?.reference || `Wise transfer #${resource.id}`;
        const stream      = detectStream(description);

        recordRevenue({ stream, amount, description, source: 'Wise', meta: { currency, transferId: resource.id } });
      }
    }
  });

  /* ===================== GUMROAD ===================== */
  /**
   * POST /webhooks/gumroad
   * Gumroad Ping (sale notification)
   * Set at: gumroad.com → Settings → Advanced → Ping URL
   */
  router.post('/gumroad', express.urlencoded({ extended: true }), (req, res) => {
    res.json({ received: true });

    const data        = req.body;
    const productName = data.product_name || 'Gumroad product';
    const price       = parseFloat(data.price || 0) / 100;  // Gumroad sends cents
    const email       = data.email || 'buyer';

    logger.info(`[Gumroad Webhook] Sale: ${productName} — $${price} from ${email}`);

    recordRevenue({
      stream:      'digital_products',
      amount:      price,
      description: `${productName} — sold to ${email}`,
      source:      'Gumroad',
      meta:        { productId: data.product_id, saleId: data.sale_id, email },
    });
  });

  /* ===================== LEMONSQUEEZY ===================== */
  /**
   * POST /webhooks/lemonsqueezy
   * LemonSqueezy webhook — order_created
   * Set at: app.lemonsqueezy.com → Settings → Webhooks
   */
  router.post('/lemonsqueezy', express.json(), (req, res) => {
    // Verify signature
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (secret) {
      const sig      = req.headers['x-signature'];
      const payload  = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      if (sig !== `sha256=${expected}`) {
        logger.warn('[LemonSqueezy] Signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    res.json({ received: true });

    const event = req.body;
    if (event.meta?.event_name === 'order_created') {
      const attrs       = event.data?.attributes || {};
      const amount      = parseFloat(attrs.total || 0) / 100;
      const productName = attrs.first_order_item?.product_name || 'LemonSqueezy product';
      const email       = attrs.user_email || 'buyer';

      logger.info(`[LemonSqueezy Webhook] Order: ${productName} — $${amount}`);

      recordRevenue({
        stream:      'digital_products',
        amount,
        description: `${productName} — sold to ${email}`,
        source:      'LemonSqueezy',
        meta:        { orderId: attrs.identifier, email },
      });
    }
  });

  /* ===================== STRIPE (READY — ACTIVATE WHEN YOU SIGN UP) ===================== */
  /**
   * POST /webhooks/stripe
   * Activate by: setting STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in .env
   * Register webhook at: dashboard.stripe.com → Developers → Webhooks
   * Events to listen to: payment_intent.succeeded, checkout.session.completed, invoice.paid
   */
  router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    const stripeSecret  = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecret || !webhookSecret) {
      logger.warn('[Stripe Webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set — skipping');
      return res.json({ received: true, note: 'Stripe not configured yet' });
    }

    let event;
    try {
      const stripe = require('stripe')(stripeSecret);
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    } catch (err) {
      logger.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).json({ error: err.message });
    }

    res.json({ received: true });
    logger.info(`[Stripe Webhook] Event: ${event.type}`);

    const handlers = {
      'payment_intent.succeeded':     () => handleStripePayment(event.data.object),
      'checkout.session.completed':   () => handleStripeCheckout(event.data.object),
      'invoice.paid':                 () => handleStripeInvoice(event.data.object),
    };

    if (handlers[event.type]) handlers[event.type]();
  });

  function handleStripePayment(pi) {
    const amount      = parseFloat(pi.amount_received || 0) / 100;
    const description = pi.description || pi.metadata?.description || 'Stripe payment';
    recordRevenue({ stream: detectStream(description), amount, description, source: 'Stripe', meta: { paymentIntentId: pi.id } });
  }

  function handleStripeCheckout(session) {
    const amount      = parseFloat(session.amount_total || 0) / 100;
    const description = session.metadata?.description || session.customer_details?.email || 'Stripe checkout';
    recordRevenue({ stream: detectStream(description), amount, description, source: 'Stripe', meta: { sessionId: session.id } });
  }

  function handleStripeInvoice(invoice) {
    const amount      = parseFloat(invoice.amount_paid || 0) / 100;
    const description = invoice.description || invoice.customer_name || invoice.customer_email || 'Stripe invoice';
    recordRevenue({ stream: detectStream(description), amount, description, source: 'Stripe', meta: { invoiceId: invoice.id } });
  }

  /* ===================== MANUAL PAYMENT ENTRY ===================== */
  /**
   * POST /api/revenue/manual
   * Elliot manually logs any income not auto-detected (cash, bank transfer, crypto, etc.)
   * Body: { amount, description, stream, source, date? }
   */
  router.post('/manual', express.json(), (req, res) => {
    const { amount, description, stream, source, date } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ error: 'amount and description are required' });
    }

    const entry = recordRevenue({
      stream:      stream || 'manual',
      amount:      parseFloat(amount),
      description: description || 'Manual entry',
      source:      source || 'Manual',
      meta:        { date: date || new Date().toISOString(), manualEntry: true },
    });

    logger.info(`[Manual Entry] $${amount} — ${description}`);
    res.json({ success: true, entry });
  });

  /* ===================== INCOME LOG ===================== */
  /**
   * GET /api/revenue/log
   * Returns the full income log for the dashboard income history table.
   */
  router.get('/log', (req, res) => {
    res.json({
      log:   EmpireState.incomeLog || [],
      total: Object.values(EmpireState.revenue).reduce((a, b) => a + (b || 0), 0),
    });
  });

  /* ===================== STREAM DETECTOR ===================== */
  // Auto-categorises income based on keywords in the description
  function detectStream(description = '') {
    const d = description.toLowerCase();
    if (d.includes('fiverr') || d.includes('upwork') || d.includes('peopleperhour') || d.includes('guru') || d.includes('freelance')) return 'freelance';
    if (d.includes('linkedin') || d.includes('consult') || d.includes('bark') || d.includes('clarity')) return 'consulting';
    if (d.includes('gumroad') || d.includes('lemon') || d.includes('template') || d.includes('course') || d.includes('ebook') || d.includes('digital')) return 'digital_products';
    if (d.includes('saas') || d.includes('subscription') || d.includes('app') || d.includes('appsumo') || d.includes('producthunt')) return 'saas';
    if (d.includes('affiliate') || d.includes('commission') || d.includes('twitter') || d.includes('social')) return 'social_media';
    return 'manual';
  }

  return router;
};
