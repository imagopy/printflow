/**
 * Specification Form Component
 * 
 * Dynamic form that renders different fields based on product category.
 */

import { Product, QuoteSpecifications } from '../services/quote.service';

interface SpecificationFormProps {
  product: Product;
  value: QuoteSpecifications;
  onChange: (specs: QuoteSpecifications) => void;
}

export default function SpecificationForm({ product, value, onChange }: SpecificationFormProps) {
  const handleChange = (field: string, fieldValue: any) => {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  };

  // Common fields for all products
  const renderCommonFields = () => (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="paper_type" className="block text-sm font-medium text-gray-700">
            Paper Type
          </label>
          <select
            id="paper_type"
            value={value.paper_type || ''}
            onChange={(e) => handleChange('paper_type', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            <option value="">Select paper type</option>
            <option value="matte">Matte</option>
            <option value="glossy">Glossy</option>
            <option value="silk">Silk</option>
            <option value="uncoated">Uncoated</option>
          </select>
        </div>

        <div>
          <label htmlFor="colors" className="block text-sm font-medium text-gray-700">
            Number of Colors
          </label>
          <select
            id="colors"
            value={value.colors || ''}
            onChange={(e) => handleChange('colors', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            <option value="">Select colors</option>
            <option value="1">1 Color (Black)</option>
            <option value="2">2 Colors</option>
            <option value="4">4 Colors (CMYK)</option>
            <option value="5">5 Colors (CMYK + Spot)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Finishing Options
        </label>
        <div className="space-y-2">
          {['Lamination', 'UV Coating', 'Die Cutting', 'Foil Stamping'].map((finish) => (
            <label key={finish} className="flex items-center">
              <input
                type="checkbox"
                checked={value.finishing?.includes(finish) || false}
                onChange={(e) => {
                  const currentFinishing = value.finishing || [];
                  if (e.target.checked) {
                    handleChange('finishing', [...currentFinishing, finish]);
                  } else {
                    handleChange(
                      'finishing',
                      currentFinishing.filter((f) => f !== finish)
                    );
                  }
                }}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">{finish}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );

  // Business cards specific fields
  const renderBusinessCardFields = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-900">Card Dimensions</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="card_width_mm" className="block text-sm font-medium text-gray-700">
            Card Width (mm)
          </label>
          <input
            type="number"
            id="card_width_mm"
            value={value.card_width_mm || 90}
            onChange={(e) => handleChange('card_width_mm', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="card_height_mm" className="block text-sm font-medium text-gray-700">
            Card Height (mm)
          </label>
          <input
            type="number"
            id="card_height_mm"
            value={value.card_height_mm || 50}
            onChange={(e) => handleChange('card_height_mm', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
      </div>

      <h3 className="text-sm font-medium text-gray-900 mt-4">Sheet Dimensions</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sheet_width_mm" className="block text-sm font-medium text-gray-700">
            Sheet Width (mm)
          </label>
          <input
            type="number"
            id="sheet_width_mm"
            value={value.sheet_width_mm || 450}
            onChange={(e) => handleChange('sheet_width_mm', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="sheet_height_mm" className="block text-sm font-medium text-gray-700">
            Sheet Height (mm)
          </label>
          <input
            type="number"
            id="sheet_height_mm"
            value={value.sheet_height_mm || 320}
            onChange={(e) => handleChange('sheet_height_mm', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
      </div>
    </div>
  );

  // Flyers/Banners specific fields
  const renderFlyerBannerFields = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-900">Document Dimensions</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="width_mm" className="block text-sm font-medium text-gray-700">
            Width (mm)
          </label>
          <input
            type="number"
            id="width_mm"
            value={value.width_mm || 210}
            onChange={(e) => handleChange('width_mm', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="height_mm" className="block text-sm font-medium text-gray-700">
            Height (mm)
          </label>
          <input
            type="number"
            id="height_mm"
            value={value.height_mm || 297}
            onChange={(e) => handleChange('height_mm', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
      </div>

      {product.category === 'marketing' && (
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={value.folded || false}
              onChange={(e) => handleChange('folded', e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Folded</span>
          </label>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Category-specific fields */}
      {product.category === 'cards' && renderBusinessCardFields()}
      {(product.category === 'marketing' || product.category === 'banners') &&
        renderFlyerBannerFields()}

      {/* Common fields */}
      {renderCommonFields()}

      {/* Custom specifications */}
      <div>
        <label htmlFor="custom_notes" className="block text-sm font-medium text-gray-700">
          Additional Notes (optional)
        </label>
        <textarea
          id="custom_notes"
          rows={3}
          value={value.custom_notes || ''}
          onChange={(e) => handleChange('custom_notes', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          placeholder="Any special requirements or instructions..."
        />
      </div>

      {/* Quick presets for common sizes */}
      {product.category === 'cards' && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Quick Size Presets</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                handleChange('card_width_mm', 90);
                handleChange('card_height_mm', 50);
              }}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Standard (90x50mm)
            </button>
            <button
              type="button"
              onClick={() => {
                handleChange('card_width_mm', 85);
                handleChange('card_height_mm', 55);
              }}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              US Size (85x55mm)
            </button>
          </div>
        </div>
      )}

      {(product.category === 'marketing' || product.category === 'banners') && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Quick Size Presets</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                handleChange('width_mm', 210);
                handleChange('height_mm', 297);
              }}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              A4 (210x297mm)
            </button>
            <button
              type="button"
              onClick={() => {
                handleChange('width_mm', 148);
                handleChange('height_mm', 210);
              }}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              A5 (148x210mm)
            </button>
            <button
              type="button"
              onClick={() => {
                handleChange('width_mm', 216);
                handleChange('height_mm', 279);
              }}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Letter (216x279mm)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}