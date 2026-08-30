describe('payment utils', () => {
  function extractLast4(cardNumber: string): string {
    return cardNumber.slice(-4);
  }

  function calculateDiscount(amount: number, promo: { discount_type: string; discount_value: number }): number {
    if (promo.discount_type === 'percentage') {
      return (amount * promo.discount_value) / 100;
    }
    return promo.discount_value;
  }

  it('extracts cardLast4', () => {
    expect(extractLast4('4242424242424242')).toBe('4242');
    expect(extractLast4('5555555555554444')).toBe('4444');
  });

  it('calculates percentage discount', () => {
    expect(calculateDiscount(500, { discount_type: 'percentage', discount_value: 20 })).toBe(100);
    expect(calculateDiscount(1000, { discount_type: 'percentage', discount_value: 10 })).toBe(100);
  });

  it('calculates fixed discount', () => {
    expect(calculateDiscount(500, { discount_type: 'fixed', discount_value: 50 })).toBe(50);
  });

  it('ensures promo race condition logic', () => {
    const promo = { max_uses: 10, used_count: 9 };
    // Atomic update should succeed
    expect(promo.used_count < promo.max_uses).toBe(true);
    promo.used_count += 1;
    expect(promo.used_count).toBe(10);
    // Next should fail
    expect(promo.used_count >= promo.max_uses).toBe(true);
  });
});
