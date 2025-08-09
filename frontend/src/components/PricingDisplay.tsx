/**
 * Pricing Display Component
 * 
 * Displays pricing breakdown with costs, margins, and calculations.
 */

import { PricingResult } from '../services/quote.service';
import clsx from 'clsx';

interface PricingDisplayProps {
  pricing: PricingResult;
  quantity: number;
  isLoading?: boolean;
  compact?: boolean;
}

export default function PricingDisplay({
  pricing,
  quantity,
  isLoading = false,
  compact = false,
}: PricingDisplayProps) {
  const unitPrice = pricing.sellingPrice / quantity;

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-500">Total Price</p>
            <p className="text-2xl font-bold text-gray-900">
              ${pricing.sellingPrice.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500">
              ${unitPrice.toFixed(3)} per unit
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Margin</p>
            <p className={clsx(
              'text-lg font-semibold',
              pricing.marginPercent >= 30 ? 'text-green-600' : 
              pricing.marginPercent >= 20 ? 'text-yellow-600' : 'text-red-600'
            )}>
              {pricing.marginPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cost Breakdown */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Cost Breakdown</h4>
        <dl className="space-y-2">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Material Cost:</dt>
            <dd className="text-gray-900">${pricing.materialCost.toFixed(2)}</dd>
          </div>
          {pricing.setupCost > 0 && (
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Setup Cost:</dt>
              <dd className="text-gray-900">${pricing.setupCost.toFixed(2)}</dd>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Labor Cost:</dt>
            <dd className="text-gray-900">${pricing.laborCost.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between text-sm font-medium pt-2 border-t">
            <dt className="text-gray-700">Total Cost:</dt>
            <dd className="text-gray-900">${pricing.totalCost.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      {/* Pricing Summary */}
      <div className="bg-primary-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Pricing Summary</h4>
        <dl className="space-y-2">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-700">Quantity:</dt>
            <dd className="text-gray-900 font-medium">{quantity.toLocaleString()} units</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-700">Unit Price:</dt>
            <dd className="text-gray-900 font-medium">${unitPrice.toFixed(3)}</dd>
          </div>
          <div className="flex justify-between text-lg font-semibold pt-2 border-t border-primary-200">
            <dt className="text-primary-900">Total Price:</dt>
            <dd className="text-primary-900">${pricing.sellingPrice.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      {/* Margin Analysis */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Margin Analysis</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Profit Margin</p>
            <p className={clsx(
              'text-2xl font-bold',
              pricing.marginPercent >= 30 ? 'text-green-600' : 
              pricing.marginPercent >= 20 ? 'text-yellow-600' : 'text-red-600'
            )}>
              {pricing.marginPercent.toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Gross Profit</p>
            <p className="text-lg font-semibold text-gray-900">
              ${(pricing.sellingPrice - pricing.totalCost).toFixed(2)}
            </p>
          </div>
        </div>
        
        {/* Margin indicator bar */}
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={clsx(
                'h-2 rounded-full transition-all duration-300',
                pricing.marginPercent >= 30 ? 'bg-green-600' : 
                pricing.marginPercent >= 20 ? 'bg-yellow-600' : 'bg-red-600'
              )}
              style={{ width: `${Math.min(pricing.marginPercent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-500">0%</span>
            <span className="text-xs text-gray-500">Target: 30%</span>
            <span className="text-xs text-gray-500">50%</span>
          </div>
        </div>
      </div>

      {/* Production Details */}
      {pricing.breakdown && Object.keys(pricing.breakdown).length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Production Details</h4>
          <dl className="space-y-2">
            {pricing.breakdown.cardsPerSheet && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">Cards per Sheet:</dt>
                <dd className="text-gray-900">{pricing.breakdown.cardsPerSheet}</dd>
              </div>
            )}
            {pricing.breakdown.sheetsNeeded && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">Sheets Required:</dt>
                <dd className="text-gray-900">{pricing.breakdown.sheetsNeeded}</dd>
              </div>
            )}
            {pricing.breakdown.materialUsage && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">Material Usage:</dt>
                <dd className="text-gray-900">{pricing.breakdown.materialUsage} units</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}