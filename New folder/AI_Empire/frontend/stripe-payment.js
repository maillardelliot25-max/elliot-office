/**
 * Stripe Payment Integration
 * Allows users to add their real credit card for payouts
 */

const StripePayment = {
  initialized: false,

  init() {
    // Load Stripe.js
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => {
      this.stripe = Stripe('pk_test_51234567890abcdefghijklmnop'); // Replace with your Stripe key
      this.elements = this.stripe.elements();
      this.cardElement = this.elements.create('card', {
        style: {
          base: {
            fontSize: '14px',
            color: '#fff',
            '::placeholder': {
              color: '#888',
            },
            backgroundColor: '#222',
            padding: '10px',
          },
        },
      });

      const cardContainer = document.getElementById('stripe-card-container');
      if (cardContainer) {
        this.cardElement.mount('#stripe-card-container');
        this.initialized = true;
      }
    };
    document.body.appendChild(script);
  },

  async addCard(e) {
    e.preventDefault();
    if (!this.initialized) {
      showToast('Stripe not loaded. Please refresh and try again.', 'error');
      return;
    }

    const { token, error } = await this.stripe.createToken(this.cardElement);
    if (error) {
      showToast(`Card error: ${error.message}`, 'error');
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE}/payment/add-card`, {
        method: 'POST',
        body: JSON.stringify({
          stripeToken: token.id,
          cardLast4: token.card.last4,
          cardBrand: token.card.brand,
        }),
      });
      showToast(`✅ Card added (${token.card.brand} ••••${token.card.last4})`, 'success');
      document.getElementById('form-stripe-card').reset();
      this.cardElement.clear();
    } catch (err) {
      showToast(`Payment setup failed: ${err.message}`, 'error');
    }
  },
};

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('stripe-card-container')) {
    StripePayment.init();
  }
});
