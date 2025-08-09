/**
 * Quote Builder Page Component
 * 
 * Multi-step form for creating quotes with real-time pricing calculations.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import {
  quoteService,
  customerService,
  productService,
  Customer,
  Product,
  QuoteSpecifications,
  PricingResult,
  CreateQuoteRequest,
} from '../services/quote.service';
import CustomerSelector from '../components/CustomerSelector';
import ProductSelector from '../components/ProductSelector';
import SpecificationForm from '../components/SpecificationForm';
import PricingDisplay from '../components/PricingDisplay';
import { getErrorMessage } from '../lib/api-client';

// Form steps
const steps = [
  { id: 'customer', name: 'Customer', description: 'Select or create customer' },
  { id: 'product', name: 'Product', description: 'Choose product type' },
  { id: 'specifications', name: 'Specifications', description: 'Enter product details' },
  { id: 'review', name: 'Review & Price', description: 'Review quote and pricing' },
];

// Form schema
const quoteFormSchema = z.object({
  customerId: z.string().uuid('Please select a customer'),
  productId: z.string().uuid('Please select a product'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  specifications: z.record(z.any()),
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

export default function QuoteBuilder() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      quantity: 100,
      specifications: {},
    },
    mode: 'onChange',
  });

  // Watch form values for real-time updates
  const watchedQuantity = watch('quantity');
  const watchedSpecs = watch('specifications');
  const watchedProductId = watch('productId');

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: (data: CreateQuoteRequest) => quoteService.createQuote(data),
    onSuccess: (quote) => {
      navigate(`/quotes/${quote.id}`);
    },
  });

  // Calculate pricing when relevant fields change
  useEffect(() => {
    if (selectedProduct && watchedQuantity > 0 && currentStep >= 2) {
      const debounceTimer = setTimeout(() => {
        calculatePricing();
      }, 500); // Debounce API calls

      return () => clearTimeout(debounceTimer);
    }
  }, [selectedProduct, watchedQuantity, watchedSpecs]);

  const calculatePricing = async () => {
    if (!selectedProduct) return;

    setIsCalculatingPrice(true);
    try {
      const result = await quoteService.previewPricing({
        productId: selectedProduct.id,
        quantity: watchedQuantity,
        specifications: watchedSpecs,
      });
      setPricing(result.pricing);
    } catch (error) {
      console.error('Pricing calculation error:', error);
    } finally {
      setIsCalculatingPrice(false);
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (data: QuoteFormData) => {
    try {
      await createQuoteMutation.mutateAsync(data);
    } catch (error) {
      console.error('Error creating quote:', error);
    }
  };

  const isStepComplete = (stepIndex: number) => {
    switch (stepIndex) {
      case 0:
        return !!selectedCustomer;
      case 1:
        return !!selectedProduct;
      case 2:
        return watchedQuantity > 0 && Object.keys(watchedSpecs).length > 0;
      case 3:
        return isValid && !!pricing;
      default:
        return false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create New Quote</h1>
        <p className="mt-1 text-sm text-gray-500">
          Follow the steps below to create a quote with real-time pricing
        </p>
      </div>

      {/* Progress Steps */}
      <nav aria-label="Progress" className="mb-8">
        <ol className="flex items-center">
          {steps.map((step, stepIdx) => (
            <li
              key={step.id}
              className={clsx(
                stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : '',
                'relative'
              )}
            >
              {stepIdx !== steps.length - 1 && (
                <div
                  className="absolute inset-0 flex items-center"
                  aria-hidden="true"
                >
                  <div className="h-0.5 w-full bg-gray-200" />
                </div>
              )}
              <button
                onClick={() => setCurrentStep(stepIdx)}
                disabled={stepIdx > currentStep && !isStepComplete(stepIdx - 1)}
                className={clsx(
                  'relative flex h-8 w-8 items-center justify-center rounded-full',
                  stepIdx < currentStep || isStepComplete(stepIdx)
                    ? 'bg-primary-600 hover:bg-primary-700'
                    : stepIdx === currentStep
                    ? 'border-2 border-primary-600 bg-white'
                    : 'border-2 border-gray-300 bg-white',
                  'disabled:cursor-not-allowed'
                )}
              >
                {stepIdx < currentStep || isStepComplete(stepIdx) ? (
                  <CheckIcon className="h-5 w-5 text-white" aria-hidden="true" />
                ) : (
                  <span
                    className={clsx(
                      stepIdx === currentStep ? 'text-primary-600' : 'text-gray-500',
                      'text-sm font-medium'
                    )}
                  >
                    {stepIdx + 1}
                  </span>
                )}
                <span className="sr-only">{step.name}</span>
              </button>
              <div className="mt-2">
                <span
                  className={clsx(
                    stepIdx === currentStep
                      ? 'text-primary-600 font-medium'
                      : 'text-gray-500',
                    'text-sm hidden sm:block'
                  )}
                >
                  {step.name}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </nav>

      {/* Form Steps */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white shadow rounded-lg p-6">
          {/* Step 1: Customer Selection */}
          {currentStep === 0 && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Customer
              </h2>
              <Controller
                name="customerId"
                control={control}
                render={({ field }) => (
                  <CustomerSelector
                    value={field.value}
                    onChange={(customerId, customer) => {
                      field.onChange(customerId);
                      setSelectedCustomer(customer);
                    }}
                    error={errors.customerId?.message}
                  />
                )}
              />
            </div>
          )}

          {/* Step 2: Product Selection */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Product
              </h2>
              <Controller
                name="productId"
                control={control}
                render={({ field }) => (
                  <ProductSelector
                    value={field.value}
                    onChange={(productId, product) => {
                      field.onChange(productId);
                      setSelectedProduct(product);
                      // Reset specifications when product changes
                      setValue('specifications', {});
                    }}
                    error={errors.productId?.message}
                  />
                )}
              />
            </div>
          )}

          {/* Step 3: Specifications */}
          {currentStep === 2 && selectedProduct && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Product Specifications
              </h2>
              <Controller
                name="quantity"
                control={control}
                render={({ field }) => (
                  <div className="mb-6">
                    <label
                      htmlFor="quantity"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Quantity
                    </label>
                    <input
                      type="number"
                      id="quantity"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                    {errors.quantity && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.quantity.message}
                      </p>
                    )}
                  </div>
                )}
              />

              <Controller
                name="specifications"
                control={control}
                render={({ field }) => (
                  <SpecificationForm
                    product={selectedProduct}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              {/* Real-time pricing preview */}
              {pricing && (
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    Estimated Pricing
                  </h3>
                  <PricingDisplay
                    pricing={pricing}
                    quantity={watchedQuantity}
                    isLoading={isCalculatingPrice}
                    compact
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Review Quote
              </h2>

              {/* Summary */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Customer</h3>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedCustomer?.name}
                  </p>
                  <p className="text-sm text-gray-500">{selectedCustomer?.email}</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Product</h3>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedProduct?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    Category: {selectedProduct?.category}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Quantity</h3>
                  <p className="mt-1 text-sm text-gray-900">
                    {watchedQuantity.toLocaleString()} units
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    Specifications
                  </h3>
                  <dl className="mt-1 text-sm text-gray-900">
                    {Object.entries(watchedSpecs).map(([key, value]) => (
                      <div key={key} className="flex justify-between py-1">
                        <dt className="text-gray-500">
                          {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}:
                        </dt>
                        <dd className="font-medium">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>

              {/* Final Pricing */}
              {pricing && (
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Quote Pricing
                  </h3>
                  <PricingDisplay
                    pricing={pricing}
                    quantity={watchedQuantity}
                    isLoading={isCalculatingPrice}
                  />
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-8 flex justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 0}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            {currentStep < steps.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStepComplete(currentStep)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={!isValid || createQuoteMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createQuoteMutation.isPending ? 'Creating...' : 'Create Quote'}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Error display */}
      {createQuoteMutation.isError && (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">
            {getErrorMessage(createQuoteMutation.error)}
          </p>
        </div>
      )}
    </div>
  );
}