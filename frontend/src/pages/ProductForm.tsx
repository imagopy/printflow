/**
 * Product Form Page Component
 * 
 * Form for creating and editing product information.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { productService } from '../services/quote.service';
import { getErrorMessage } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';

// Form schema
const productSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  category: z.enum(['cards', 'marketing', 'banners', 'other']),
  setup_cost: z.number().min(0, 'Setup cost must be positive'),
  setup_threshold: z.number().min(1, 'Setup threshold must be at least 1'),
  estimated_hours: z.number().min(0.1, 'Estimated hours must be positive'),
  material_id: z.string().optional(),
  active: z.boolean(),
});

type ProductFormData = z.infer<typeof productSchema>;

const CATEGORIES = [
  { value: 'cards', label: 'Business Cards' },
  { value: 'marketing', label: 'Marketing Materials' },
  { value: 'banners', label: 'Banners & Signs' },
  { value: 'other', label: 'Other' },
];

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditMode = !!id;
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <p className="text-sm text-red-800">
          You don't have permission to access this page.
        </p>
      </div>
    );
  }

  // Fetch product data if editing
  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productService.getProduct(id!),
    enabled: isEditMode,
  });

  // Form setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      category: 'cards',
      setup_cost: 0,
      setup_threshold: 100,
      estimated_hours: 1,
      material_id: '',
      active: true,
    },
  });

  // Update form when product data is loaded
  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        category: product.category as any,
        setup_cost: product.setup_cost,
        setup_threshold: product.setup_threshold,
        estimated_hours: product.estimated_hours,
        material_id: product.material_id || '',
        active: product.active,
      });
    }
  }, [product, reset]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: productService.createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/products');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: ProductFormData) => productService.updateProduct(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      navigate('/products');
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: ({ originalId, name }: { originalId: string; name: string }) =>
      productService.duplicateProduct(originalId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/products');
    },
  });

  const onSubmit = async (data: ProductFormData) => {
    try {
      if (isDuplicating && id) {
        await duplicateMutation.mutateAsync({ originalId: id, name: data.name });
      } else if (isEditMode) {
        await updateMutation.mutateAsync(data);
      } else {
        await createMutation.mutateAsync(data);
      }
    } catch (error) {
      // Error is handled by the form
    }
  };

  // Handle duplicate mode
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('duplicate') === 'true' && product) {
      setIsDuplicating(true);
      reset({
        ...product,
        name: `${product.name} (Copy)`,
        category: product.category as any,
        material_id: product.material_id || '',
      });
    }
  }, [product, reset]);

  if (isEditMode && productLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const error = createMutation.error || updateMutation.error || duplicateMutation.error;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/products"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to products
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {isDuplicating ? 'Duplicate Product' : isEditMode ? 'Edit Product' : 'Add New Product'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isDuplicating
            ? 'Create a copy of an existing product with a new name.'
            : isEditMode
            ? 'Update product information and pricing details.'
            : 'Enter product information to add to your catalog.'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
          <div className="px-4 py-6 sm:p-8">
            <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              {/* Name */}
              <div className="sm:col-span-4">
                <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                  Product Name
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="name"
                    {...register('name')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6"
                    placeholder="e.g., Standard Business Cards"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="sm:col-span-3">
                <label htmlFor="category" className="block text-sm font-medium leading-6 text-gray-900">
                  Category
                </label>
                <div className="mt-2">
                  <select
                    id="category"
                    {...register('category')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
                  )}
                </div>
              </div>

              {/* Setup Cost */}
              <div className="sm:col-span-3">
                <label htmlFor="setup_cost" className="block text-sm font-medium leading-6 text-gray-900">
                  Setup Cost ($)
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    id="setup_cost"
                    step="0.01"
                    {...register('setup_cost', { valueAsNumber: true })}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6"
                  />
                  {errors.setup_cost && (
                    <p className="mt-1 text-sm text-red-600">{errors.setup_cost.message}</p>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  One-time cost for small orders
                </p>
              </div>

              {/* Setup Threshold */}
              <div className="sm:col-span-3">
                <label htmlFor="setup_threshold" className="block text-sm font-medium leading-6 text-gray-900">
                  Setup Threshold
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    id="setup_threshold"
                    {...register('setup_threshold', { valueAsNumber: true })}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6"
                  />
                  {errors.setup_threshold && (
                    <p className="mt-1 text-sm text-red-600">{errors.setup_threshold.message}</p>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Minimum quantity to waive setup cost
                </p>
              </div>

              {/* Estimated Hours */}
              <div className="sm:col-span-3">
                <label htmlFor="estimated_hours" className="block text-sm font-medium leading-6 text-gray-900">
                  Estimated Hours
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    id="estimated_hours"
                    step="0.1"
                    {...register('estimated_hours', { valueAsNumber: true })}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6"
                  />
                  {errors.estimated_hours && (
                    <p className="mt-1 text-sm text-red-600">{errors.estimated_hours.message}</p>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Production time per order
                </p>
              </div>

              {/* Active Status */}
              <div className="sm:col-span-6">
                <div className="flex items-start">
                  <div className="flex h-6 items-center">
                    <input
                      id="active"
                      type="checkbox"
                      {...register('active')}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                    />
                  </div>
                  <div className="ml-3">
                    <label htmlFor="active" className="text-sm font-medium leading-6 text-gray-900">
                      Active
                    </label>
                    <p className="text-sm text-gray-500">
                      Active products can be selected when creating quotes
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-x-6 border-t border-gray-900/10 px-4 py-4 sm:px-8">
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="text-sm font-semibold leading-6 text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? 'Saving...'
                : isDuplicating
                ? 'Create Copy'
                : isEditMode
                ? 'Save changes'
                : 'Create product'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{getErrorMessage(error)}</p>
          </div>
        )}
      </form>
    </div>
  );
}