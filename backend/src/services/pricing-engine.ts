/**
 * Pricing Engine Service
 * 
 * Core business logic for calculating print job pricing.
 * Handles material costs, labor, setup fees, and markup calculations.
 * 
 * @module services/pricing-engine
 */

import { Decimal } from '@prisma/client/runtime/library';
import { BusinessError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Pricing calculation inputs
 */
export interface PricingInputs {
  product: {
    id: string;
    name: string;
    setup_cost: Decimal | number;
    setup_threshold: number;
    estimated_hours: Decimal | number;
    base_cost_formula?: any;
  };
  material?: {
    id: string;
    name: string;
    cost_per_unit: Decimal | number;
    unit_type: 'sheet' | 'roll' | 'kg';
  } | null;
  shop: {
    id?: string;
    markup_percent: Decimal | number;
    labor_hourly_rate?: Decimal | number;
  };
  quantity: number;
  specifications: Record<string, any>;
}

/**
 * Pricing calculation result
 */
export interface PricingResult {
  materialCost: number;
  setupCost: number;
  laborCost: number;
  totalCost: number;
  sellingPrice: number;
  marginPercent: number;
  breakdown: {
    materialUsage?: {
      unitsNeeded: number;
      unitType: string;
      wastePercent?: number;
    };
    laborBreakdown?: {
      estimatedHours: number;
      hourlyRate: number;
    };
    calculations: Record<string, any>;
  };
}

/**
 * Material calculation strategies by product type
 */
interface MaterialCalculator {
  calculate(quantity: number, specs: Record<string, any>): {
    unitsNeeded: number;
    wastePercent: number;
  };
}

/**
 * Business card material calculator
 * Calculates sheet usage based on card dimensions
 */
class BusinessCardCalculator implements MaterialCalculator {
  calculate(quantity: number, specs: Record<string, any>): {
    unitsNeeded: number;
    wastePercent: number;
  } {
    // Default dimensions if not specified
    const sheetWidth = Number(specs.sheet_width_mm || 450);
    const sheetHeight = Number(specs.sheet_height_mm || 320);
    const cardWidth = Number(specs.card_width_mm || 90);
    const cardHeight = Number(specs.card_height_mm || 50);
    
    // Add bleed and margins
    const bleed = Number(specs.bleed_mm || 3);
    const margin = Number(specs.margin_mm || 5);
    const effectiveCardWidth = cardWidth + (2 * bleed);
    const effectiveCardHeight = cardHeight + (2 * bleed);
    
    // Calculate cards per sheet (considering both orientations)
    const orientation1 = {
      across: Math.floor((sheetWidth - margin) / (effectiveCardWidth + margin)),
      down: Math.floor((sheetHeight - margin) / (effectiveCardHeight + margin)),
    };
    
    const orientation2 = {
      across: Math.floor((sheetWidth - margin) / (effectiveCardHeight + margin)),
      down: Math.floor((sheetHeight - margin) / (effectiveCardWidth + margin)),
    };
    
    const cardsPerSheet1 = Math.max(0, orientation1.across * orientation1.down);
    const cardsPerSheet2 = Math.max(0, orientation2.across * orientation2.down);
    const cardsPerSheet = Math.max(cardsPerSheet1, cardsPerSheet2, 1);
    
    // Calculate sheets needed
    const sheetsNeeded = Math.ceil(quantity / cardsPerSheet);
    
    // Calculate waste percentage
    const totalCards = sheetsNeeded * cardsPerSheet;
    const wasteCards = totalCards - quantity;
    const wastePercent = (wasteCards / totalCards) * 100;
    
    return {
      unitsNeeded: sheetsNeeded,
      wastePercent: Math.round(wastePercent * 100) / 100,
    };
  }
}

/**
 * Flyer/poster material calculator
 * Simpler calculation for single items per sheet
 */
class FlyerCalculator implements MaterialCalculator {
  calculate(quantity: number, specs: Record<string, any>): {
    unitsNeeded: number;
    wastePercent: number;
  } {
    const itemsPerSheet = Number(specs.items_per_sheet || 1);
    const sheetsNeeded = Math.ceil(quantity / itemsPerSheet);
    
    const totalItems = sheetsNeeded * itemsPerSheet;
    const wasteItems = totalItems - quantity;
    const wastePercent = (wasteItems / totalItems) * 100;
    
    return {
      unitsNeeded: sheetsNeeded,
      wastePercent: Math.round(wastePercent * 100) / 100,
    };
  }
}

/**
 * Banner/roll material calculator
 * Calculates based on linear measurements
 */
class BannerCalculator implements MaterialCalculator {
  calculate(quantity: number, specs: Record<string, any>): {
    unitsNeeded: number;
    wastePercent: number;
  } {
    const length = Number(specs.length_m || 1);
    const wasteAllowance = Number(specs.waste_allowance_percent || 5);
    
    const totalLength = length * quantity;
    const unitsNeeded = totalLength * (1 + wasteAllowance / 100);
    
    return {
      unitsNeeded: Math.ceil(unitsNeeded * 100) / 100,
      wastePercent: wasteAllowance,
    };
  }
}

/**
 * Get material calculator based on product category
 * 
 * @param category - Product category
 * @returns {MaterialCalculator} Appropriate calculator
 */
function getMaterialCalculator(category: string): MaterialCalculator {
  const calculators: Record<string, MaterialCalculator> = {
    'business-cards': new BusinessCardCalculator(),
    'flyers': new FlyerCalculator(),
    'posters': new FlyerCalculator(),
    'banners': new BannerCalculator(),
  };
  
  return calculators[category.toLowerCase()] || new FlyerCalculator();
}

/**
 * Calculate pricing for a print job
 * 
 * @param inputs - Pricing calculation inputs
 * @returns {PricingResult} Detailed pricing breakdown
 * @throws {BusinessError} If calculation fails
 */
export function calculatePricing(inputs: PricingInputs): PricingResult {
  const { product, material, shop, quantity, specifications } = inputs;
  
  // Validate inputs
  if (quantity <= 0) {
    throw new BusinessError('Quantity must be greater than zero', 'INVALID_QUANTITY');
  }
  
  // Convert Decimal types to numbers for calculations
  const setupCost = Number(product.setup_cost);
  const setupThreshold = product.setup_threshold;
  const estimatedHours = Number(product.estimated_hours);
  const markupPercent = Number(shop.markup_percent);
  const laborHourlyRate = shop.labor_hourly_rate ? Number(shop.labor_hourly_rate) : 50; // Default $50/hour
  
  let materialCost = 0;
  let materialUsage = undefined;
  
  // Calculate material cost if material is specified
  if (material) {
    const category = specifications.category || 'default';
    const calculator = getMaterialCalculator(category);
    
    const { unitsNeeded, wastePercent } = calculator.calculate(quantity, specifications);
    const costPerUnit = Number(material.cost_per_unit);
    
    materialCost = unitsNeeded * costPerUnit;
    materialUsage = {
      unitsNeeded,
      unitType: material.unit_type,
      wastePercent,
    };
  }
  
  // Apply setup cost if quantity is below threshold
  const applicableSetupCost = quantity < setupThreshold ? setupCost : 0;
  
  // Calculate labor cost
  const laborCost = estimatedHours * laborHourlyRate;
  
  // Calculate total cost
  const totalCost = materialCost + applicableSetupCost + laborCost;
  
  // Apply markup to get selling price
  const sellingPrice = totalCost * (1 + markupPercent / 100);
  
  // Calculate margin percentage
  const marginAmount = sellingPrice - totalCost;
  const marginPercent = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
  
  // Round monetary values to 2 decimal places
  const result: PricingResult = {
    materialCost: Math.round(materialCost * 100) / 100,
    setupCost: Math.round(applicableSetupCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    sellingPrice: Math.round(sellingPrice * 100) / 100,
    marginPercent: Math.round(marginPercent * 100) / 100,
    breakdown: {
      materialUsage,
      laborBreakdown: {
        estimatedHours,
        hourlyRate: laborHourlyRate,
      },
      calculations: {
        quantity,
        setupThreshold,
        markupPercent,
        setupApplied: applicableSetupCost > 0,
      },
    },
  };
  
  logger.debug('Pricing calculated', {
    productId: product.id,
    quantity,
    result,
  });
  
  return result;
}

/**
 * Validate pricing specifications
 * Ensures all required fields are present for accurate calculations
 * 
 * @param productCategory - Product category
 * @param specifications - Product specifications
 * @throws {BusinessError} If required specifications are missing
 */
export function validatePricingSpecifications(
  productCategory: string,
  specifications: Record<string, any>
): void {
  const requiredSpecs: Record<string, string[]> = {
    'business-cards': ['card_width_mm', 'card_height_mm'],
    'flyers': ['size', 'paper_type'],
    'posters': ['width_mm', 'height_mm', 'paper_type'],
    'banners': ['length_m', 'material_type'],
  };
  
  const required = requiredSpecs[productCategory.toLowerCase()];
  if (!required) {
    return; // No specific requirements for this category
  }
  
  const missing = required.filter(spec => !specifications[spec]);
  if (missing.length > 0) {
    throw new BusinessError(
      `Missing required specifications: ${missing.join(', ')}`,
      'MISSING_SPECIFICATIONS',
      { productCategory, missing }
    );
  }
}

/**
 * Calculate volume discount
 * Apply discounts based on quantity tiers
 * 
 * @param basePrice - Base selling price
 * @param quantity - Order quantity
 * @param discountTiers - Volume discount tiers
 * @returns {number} Discounted price
 */
export function applyVolumeDiscount(
  basePrice: number,
  quantity: number,
  discountTiers: Array<{ minQuantity: number; discountPercent: number }>
): number {
  // Sort tiers by quantity descending
  const sortedTiers = [...discountTiers].sort((a, b) => b.minQuantity - a.minQuantity);
  
  // Find applicable tier
  const applicableTier = sortedTiers.find(tier => quantity >= tier.minQuantity);
  
  if (!applicableTier) {
    return basePrice;
  }
  
  const discountedPrice = basePrice * (1 - applicableTier.discountPercent / 100);
  return Math.round(discountedPrice * 100) / 100;
}

/**
 * Estimate production time
 * Calculates estimated production time based on quantity and complexity
 * 
 * @param quantity - Order quantity
 * @param baseHours - Base hours for single unit
 * @param complexity - Complexity factor (1-5)
 * @returns {number} Estimated hours
 */
export function estimateProductionTime(
  quantity: number,
  baseHours: number,
  complexity: number = 1
): number {
  // Apply economies of scale
  const scaleFactor = Math.log10(quantity + 1) * 0.1 + 0.9;
  
  // Apply complexity multiplier
  const complexityMultiplier = 1 + (complexity - 1) * 0.25;
  
  const estimatedHours = baseHours * quantity * scaleFactor * complexityMultiplier;
  
  return Math.round(estimatedHours * 100) / 100;
}