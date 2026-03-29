/**
 * Linx Payment Integration
 * Popular in Trinidad, Caribbean, and Latin America
 * Supports: Credit/debit cards, bank transfers, local payment methods
 */

const LinxPayment = {
  initialized: false,

  async init() {
    try {
      // Linx SDK initialization
      this.initialized = true;
      console.log('[LinxPayment] Ready for Trinidad payments');
    } catch (err) {
      console.error('[LinxPayment] Init failed:', err);
    }
  },

  async addCard(e) {
    e.preventDefault();
    const cardNumber = getVal('cfg-card-number');
    const cardName = getVal('cfg-card-name');
    const expiryMonth = getVal('cfg-card-expiry-month');
    const expiryYear = getVal('cfg-card-expiry-year');
    const cvv = getVal('cfg-card-cvv');

    if (!cardNumber || !cardName || !expiryMonth || !expiryYear || !cvv) {
      showToast('Please fill in all card details', 'error');
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE}/payment/add-linx-card`, {
        method: 'POST',
        body: JSON.stringify({
          cardNumber: cardNumber.replace(/\s/g, ''),
          cardHolder: cardName,
          expiryMonth: parseInt(expiryMonth),
          expiryYear: parseInt(expiryYear),
          cvv,
          country: 'TT', // Trinidad
        }),
      });

      showToast(`✅ Card added securely via Linx`, 'success');
      document.getElementById('form-linx-card')?.reset();
    } catch (err) {
      showToast(`Payment setup failed: ${err.message}`, 'error');
    }
  },

  async addBankAccount(e) {
    e.preventDefault();
    const bankCode = getVal('cfg-bank-code');
    const accountNumber = getVal('cfg-bank-account-num');
    const accountHolder = getVal('cfg-bank-holder');

    if (!bankCode || !accountNumber || !accountHolder) {
      showToast('Please fill in all bank details', 'error');
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE}/payment/add-linx-bank`, {
        method: 'POST',
        body: JSON.stringify({
          bankCode,
          accountNumber,
          accountHolder,
          country: 'TT',
        }),
      });

      showToast(`✅ Bank account connected via Linx`, 'success');
      document.getElementById('form-linx-bank')?.reset();
    } catch (err) {
      showToast(`Bank setup failed: ${err.message}`, 'error');
    }
  },
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  LinxPayment.init();
});
