/**
 * Product Selector Component
 * 
 * Grid-based product selector with category filtering.
 */

import { useState } from 'react';
import { RadioGroup } from '@headlessui/react';
import { CheckCircleIcon } from '@heroicons/react/20/solid';
import { useQuery } from '@tanstack/react-query';
import { productService, Product } from '../services/quote.service';
import clsx from 'clsx';

interface ProductSelectorProps {
  value?: string;
  onChange: (productId: string, product: Product) => void;
  error?: string;
}

export default function ProductSelector({ value, onChange, error }: ProductSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Fetch products
  const { data: productsResponse, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'active'],
    queryFn: () => productService.getProducts({ active: true }),
  });

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => productService.getCategories(),
  });

  const products = productsResponse?.data || [];

  // Filter products by category
  const filteredProducts =
    selectedCategory === 'all'
      ? products
      : products.filter((product) => product.category === selectedCategory);

  if (productsLoading || categoriesLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Category Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Category
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={clsx(
              'px-3 py-1 text-sm rounded-full transition-colors',
              selectedCategory === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            All Products ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category}
              type="button"
              onClick={() => setSelectedCategory(cat.category)}
              className={clsx(
                'px-3 py-1 text-sm rounded-full transition-colors',
                selectedCategory === cat.category
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              {cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <RadioGroup
        value={value}
        onChange={(productId: string) => {
          const product = products.find((p) => p.id === productId);
          if (product) {
            onChange(productId, product);
          }
        }}
      >
        <RadioGroup.Label className="sr-only">Choose a product</RadioGroup.Label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <RadioGroup.Option
              key={product.id}
              value={product.id}
              className={({ active, checked }) =>
                clsx(
                  'relative flex cursor-pointer rounded-lg px-5 py-4 shadow-sm focus:outline-none',
                  active ? 'ring-2 ring-primary-600 ring-offset-2' : '',
                  checked
                    ? 'bg-primary-50 border-primary-600 border-2'
                    : 'bg-white border-gray-300 border'
                )
              }
            >
              {({ active, checked }) => (
                <>
                  <div className="flex flex-1 items-center">
                    <div className="flex-1">
                      <RadioGroup.Label
                        as="p"
                        className={clsx(
                          'font-medium',
                          checked ? 'text-primary-900' : 'text-gray-900'
                        )}
                      >
                        {product.name}
                      </RadioGroup.Label>
                      <RadioGroup.Description
                        as="div"
                        className={clsx(
                          'text-sm',
                          checked ? 'text-primary-700' : 'text-gray-500'
                        )}
                      >
                        <p className="sm:inline">
                          Category: {product.category} • Setup: ${product.setup_cost}
                        </p>
                        {product.material && (
                          <p className="sm:inline sm:ml-1">
                            • Material: {product.material.name}
                          </p>
                        )}
                      </RadioGroup.Description>
                    </div>
                    {checked && (
                      <div className="shrink-0 text-primary-600">
                        <CheckCircleIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>

      {filteredProducts.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          No products found in this category.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}