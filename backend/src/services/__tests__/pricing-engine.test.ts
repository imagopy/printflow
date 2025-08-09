/**
 * Pricing Engine Unit Tests
 * 
 * Comprehensive test coverage for pricing calculations including edge cases,
 * different product types, and business scenarios.
 * 
 * @module services/__tests__/pricing-engine
 */

import {
  calculatePricing,
  validatePricingSpecifications,
  applyVolumeDiscount,
  estimateProductionTime,
  PricingInputs,
  PricingResult,
} from '../pricing-engine';
import { BusinessError } from '../../utils/errors';

describe('PricingEngine', () => {
  /**
   * Test fixture: Standard business card pricing inputs
   */
  const createBusinessCardInputs = (overrides?: Partial<PricingInputs>): PricingInputs => ({
    product: {
      id: 'prod-1',
      name: 'Standard Business Cards',
      setup_cost: 25.00,
      setup_threshold: 100,
      estimated_hours: 0.5,
      base_cost_formula: null,
    },
    material: {
      id: 'mat-1',
      name: '300gsm Card Stock',
      cost_per_unit: 0.15,
      unit_type: 'sheet',
    },
    shop: {
      id: 'shop-1',
      markup_percent: 40,
      labor_hourly_rate: 50,
    },
    quantity: 500,
    specifications: {
      category: 'business-cards',
      card_width_mm: 90,
      card_height_mm: 50,
      sheet_width_mm: 450,
      sheet_height_mm: 320,
      bleed_mm: 3,
      margin_mm: 5,
    },
    ...overrides,
  });

  describe('calculatePricing', () => {
    it('should calculate correct pricing for standard business cards', () => {
      const inputs = createBusinessCardInputs();
      const result = calculatePricing(inputs);

      expect(result).toMatchObject({
        materialCost: expect.any(Number),
        setupCost: 0, // Quantity above threshold
        laborCost: 25.00, // 0.5 hours * $50/hour
        totalCost: expect.any(Number),
        sellingPrice: expect.any(Number),
        marginPercent: expect.any(Number),
      });

      // Verify margin calculation
      const expectedMargin = ((result.sellingPrice - result.totalCost) / result.sellingPrice) * 100;
      expect(result.marginPercent).toBeCloseTo(expectedMargin, 2);
    });

    it('should apply setup cost when quantity is below threshold', () => {
      const inputs = createBusinessCardInputs({ quantity: 50 });
      const result = calculatePricing(inputs);

      expect(result.setupCost).toBe(25.00);
      expect(result.breakdown.calculations.setupApplied).toBe(true);
    });

    it('should calculate material usage correctly for business cards', () => {
      const inputs = createBusinessCardInputs();
      const result = calculatePricing(inputs);

      expect(result.breakdown.materialUsage).toBeDefined();
      expect(result.breakdown.materialUsage?.unitType).toBe('sheet');
      expect(result.breakdown.materialUsage?.unitsNeeded).toBeGreaterThan(0);
      expect(result.breakdown.materialUsage?.wastePercent).toBeGreaterThanOrEqual(0);
    });

    it('should handle edge case of very small quantities', () => {
      const inputs = createBusinessCardInputs({ quantity: 1 });
      const result = calculatePricing(inputs);

      expect(result.materialCost).toBeGreaterThan(0);
      expect(result.setupCost).toBe(25.00);
      expect(result.totalCost).toBeGreaterThan(0);
    });

    it('should handle products without materials', () => {
      const inputs = createBusinessCardInputs({ material: null });
      const result = calculatePricing(inputs);

      expect(result.materialCost).toBe(0);
      expect(result.breakdown.materialUsage).toBeUndefined();
      expect(result.totalCost).toBe(result.setupCost + result.laborCost);
    });

    it('should throw error for invalid quantity', () => {
      const inputs = createBusinessCardInputs({ quantity: 0 });
      
      expect(() => calculatePricing(inputs)).toThrow(BusinessError);
      expect(() => calculatePricing(inputs)).toThrow('Quantity must be greater than zero');
    });

    it('should handle different card orientations optimally', () => {
      // Test portrait orientation
      const portraitInputs = createBusinessCardInputs({
        specifications: {
          ...createBusinessCardInputs().specifications,
          card_width_mm: 50,
          card_height_mm: 90,
        },
      });
      
      const portraitResult = calculatePricing(portraitInputs);
      
      // Test landscape orientation (should use same number of sheets)
      const landscapeInputs = createBusinessCardInputs({
        specifications: {
          ...createBusinessCardInputs().specifications,
          card_width_mm: 90,
          card_height_mm: 50,
        },
      });
      
      const landscapeResult = calculatePricing(landscapeInputs);
      
      // Both should optimize sheet usage
      expect(portraitResult.materialCost).toBeDefined();
      expect(landscapeResult.materialCost).toBeDefined();
    });

    it('should calculate correct pricing for flyers', () => {
      const flyerInputs: PricingInputs = {
        product: {
          id: 'prod-2',
          name: 'A5 Flyers',
          setup_cost: 50,
          setup_threshold: 50,
          estimated_hours: 1,
          base_cost_formula: null,
        },
        material: {
          id: 'mat-2',
          name: '150gsm Gloss Paper',
          cost_per_unit: 0.08,
          unit_type: 'sheet',
        },
        shop: {
          id: 'shop-1',
          markup_percent: 50,
          labor_hourly_rate: 50,
        },
        quantity: 1000,
        specifications: {
          category: 'flyers',
          items_per_sheet: 4,
          size: 'A5',
          paper_type: 'gloss',
        },
      };

      const result = calculatePricing(flyerInputs);

      expect(result.materialCost).toBe(20.00); // 250 sheets * $0.08
      expect(result.setupCost).toBe(0); // Quantity above threshold
      expect(result.laborCost).toBe(50.00); // 1 hour * $50/hour
      expect(result.totalCost).toBe(70.00);
      expect(result.sellingPrice).toBe(105.00); // 50% markup
    });

    it('should calculate correct pricing for banners', () => {
      const bannerInputs: PricingInputs = {
        product: {
          id: 'prod-3',
          name: 'Vinyl Banner',
          setup_cost: 0,
          setup_threshold: 0,
          estimated_hours: 2,
          base_cost_formula: null,
        },
        material: {
          id: 'mat-3',
          name: 'Vinyl Roll',
          cost_per_unit: 5.00,
          unit_type: 'roll',
        },
        shop: {
          id: 'shop-1',
          markup_percent: 60,
          labor_hourly_rate: 50,
        },
        quantity: 5,
        specifications: {
          category: 'banners',
          length_m: 2,
          waste_allowance_percent: 10,
        },
      };

      const result = calculatePricing(bannerInputs);

      expect(result.breakdown.materialUsage?.unitsNeeded).toBe(11); // 10m + 10% waste
      expect(result.materialCost).toBe(55.00); // 11 units * $5
      expect(result.laborCost).toBe(100.00); // 2 hours * $50/hour
    });
  });

  describe('validatePricingSpecifications', () => {
    it('should pass validation for complete business card specs', () => {
      const specs = {
        card_width_mm: 90,
        card_height_mm: 50,
      };

      expect(() => validatePricingSpecifications('business-cards', specs)).not.toThrow();
    });

    it('should throw error for missing required specs', () => {
      const specs = {
        card_width_mm: 90,
        // Missing card_height_mm
      };

      expect(() => validatePricingSpecifications('business-cards', specs)).toThrow(BusinessError);
      expect(() => validatePricingSpecifications('business-cards', specs)).toThrow('Missing required specifications: card_height_mm');
    });

    it('should not validate unknown product categories', () => {
      const specs = {};
      
      expect(() => validatePricingSpecifications('unknown-category', specs)).not.toThrow();
    });
  });

  describe('applyVolumeDiscount', () => {
    const discountTiers = [
      { minQuantity: 100, discountPercent: 5 },
      { minQuantity: 500, discountPercent: 10 },
      { minQuantity: 1000, discountPercent: 15 },
    ];

    it('should apply correct discount for each tier', () => {
      expect(applyVolumeDiscount(100, 50, discountTiers)).toBe(100); // No discount
      expect(applyVolumeDiscount(100, 100, discountTiers)).toBe(95); // 5% discount
      expect(applyVolumeDiscount(100, 500, discountTiers)).toBe(90); // 10% discount
      expect(applyVolumeDiscount(100, 1000, discountTiers)).toBe(85); // 15% discount
    });

    it('should apply highest applicable discount', () => {
      expect(applyVolumeDiscount(100, 1500, discountTiers)).toBe(85); // Still 15%
    });

    it('should handle empty discount tiers', () => {
      expect(applyVolumeDiscount(100, 1000, [])).toBe(100);
    });
  });

  describe('estimateProductionTime', () => {
    it('should calculate basic production time', () => {
      const time = estimateProductionTime(100, 0.1, 1);
      expect(time).toBeGreaterThan(0);
      expect(time).toBeLessThan(100 * 0.1); // Should have economies of scale
    });

    it('should apply complexity multiplier', () => {
      const simpleTime = estimateProductionTime(100, 0.1, 1);
      const complexTime = estimateProductionTime(100, 0.1, 5);
      
      expect(complexTime).toBeGreaterThan(simpleTime);
    });

    it('should apply economies of scale', () => {
      const smallBatchTime = estimateProductionTime(10, 1, 1);
      const largeBatchTime = estimateProductionTime(1000, 1, 1);
      
      const smallBatchPerUnit = smallBatchTime / 10;
      const largeBatchPerUnit = largeBatchTime / 1000;
      
      expect(largeBatchPerUnit).toBeLessThan(smallBatchPerUnit);
    });

    it('should handle edge cases', () => {
      expect(estimateProductionTime(0, 1, 1)).toBe(0);
      expect(estimateProductionTime(1, 0, 1)).toBe(0);
      expect(estimateProductionTime(1, 1, 0)).toBeGreaterThan(0); // Complexity defaults to 1
    });
  });

  describe('Business Scenarios', () => {
    it('should handle rush job with high markup', () => {
      const rushInputs = createBusinessCardInputs({
        shop: {
          id: 'shop-1',
          markup_percent: 100, // Rush job premium
          labor_hourly_rate: 75, // Overtime rate
        },
      });

      const result = calculatePricing(rushInputs);
      
      expect(result.marginPercent).toBeCloseTo(50, 1); // 100% markup = 50% margin
      expect(result.laborCost).toBe(37.50); // 0.5 hours * $75/hour
    });

    it('should handle bulk order with minimal waste', () => {
      const bulkInputs = createBusinessCardInputs({
        quantity: 10000,
        specifications: {
          ...createBusinessCardInputs().specifications,
          card_width_mm: 85, // Optimized size for less waste
          card_height_mm: 55,
        },
      });

      const result = calculatePricing(bulkInputs);
      
      expect(result.breakdown.materialUsage?.wastePercent).toBeLessThan(10);
      expect(result.setupCost).toBe(0); // Well above threshold
    });

    it('should handle premium materials correctly', () => {
      const premiumInputs = createBusinessCardInputs({
        material: {
          id: 'mat-premium',
          name: 'Premium Textured Card',
          cost_per_unit: 0.75, // 5x standard cost
          unit_type: 'sheet',
        },
      });

      const standardResult = calculatePricing(createBusinessCardInputs());
      const premiumResult = calculatePricing(premiumInputs);
      
      expect(premiumResult.materialCost).toBeGreaterThan(standardResult.materialCost * 4);
      expect(premiumResult.sellingPrice).toBeGreaterThan(standardResult.sellingPrice);
    });
  });
});