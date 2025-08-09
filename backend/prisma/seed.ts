/**
 * Database Seed Script
 * 
 * Populates the database with initial demo data for development and testing.
 * Creates a demo shop with users, customers, products, and materials.
 * 
 * Usage: npm run db:seed
 * 
 * @module prisma/seed
 */

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create demo shop
  const shop = await prisma.shop.create({
    data: {
      name: 'Demo Print Shop',
      markup_percent: 40,
      labor_hourly_rate: 50,
    },
  });

  console.log(`✅ Created shop: ${shop.name}`);

  // Create demo users
  const passwordHash = await bcrypt.hash('Demo123!', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@demo.printflow.com',
      password_hash: passwordHash,
      role: UserRole.admin,
      shop_id: shop.id,
    },
  });

  const salesUser = await prisma.user.create({
    data: {
      email: 'sales@demo.printflow.com',
      password_hash: passwordHash,
      role: UserRole.sales,
      shop_id: shop.id,
    },
  });

  const productionUser = await prisma.user.create({
    data: {
      email: 'production@demo.printflow.com',
      password_hash: passwordHash,
      role: UserRole.production,
      shop_id: shop.id,
    },
  });

  console.log('✅ Created demo users (password: Demo123!)');

  // Create materials
  const materials = await Promise.all([
    prisma.material.create({
      data: {
        name: '300gsm Matte Card Stock',
        cost_per_unit: 0.15,
        unit_type: 'sheet',
        supplier: 'Paper Plus Supplies',
        current_stock_level: 5000,
        shop_id: shop.id,
      },
    }),
    prisma.material.create({
      data: {
        name: '350gsm Gloss Card Stock',
        cost_per_unit: 0.18,
        unit_type: 'sheet',
        supplier: 'Paper Plus Supplies',
        current_stock_level: 3000,
        shop_id: shop.id,
      },
    }),
    prisma.material.create({
      data: {
        name: '150gsm Gloss Paper',
        cost_per_unit: 0.08,
        unit_type: 'sheet',
        supplier: 'Budget Papers Inc',
        current_stock_level: 10000,
        shop_id: shop.id,
      },
    }),
    prisma.material.create({
      data: {
        name: 'Vinyl Banner Roll',
        cost_per_unit: 5.00,
        unit_type: 'roll',
        supplier: 'Banner World',
        current_stock_level: 50,
        shop_id: shop.id,
      },
    }),
  ]);

  console.log(`✅ Created ${materials.length} materials`);

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Standard Business Cards',
        category: 'business-cards',
        setup_cost: 25,
        setup_threshold: 100,
        estimated_hours: 0.5,
        material_id: materials[0].id,
        active: true,
        shop_id: shop.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Premium Business Cards',
        category: 'business-cards',
        setup_cost: 35,
        setup_threshold: 100,
        estimated_hours: 0.75,
        material_id: materials[1].id,
        active: true,
        shop_id: shop.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'A5 Flyers',
        category: 'flyers',
        setup_cost: 50,
        setup_threshold: 250,
        estimated_hours: 1,
        material_id: materials[2].id,
        active: true,
        shop_id: shop.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'A4 Flyers',
        category: 'flyers',
        setup_cost: 50,
        setup_threshold: 250,
        estimated_hours: 1.5,
        material_id: materials[2].id,
        active: true,
        shop_id: shop.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Vinyl Banner (per meter)',
        category: 'banners',
        setup_cost: 0,
        setup_threshold: 0,
        estimated_hours: 2,
        material_id: materials[3].id,
        active: true,
        shop_id: shop.id,
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // Create demo customers
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: 'Acme Corporation',
        email: 'contact@acme.example.com',
        phone: '+1 (555) 123-4567',
        address: '123 Business St, Suite 100, Business City, BC 12345',
        shop_id: shop.id,
      },
    }),
    prisma.customer.create({
      data: {
        name: 'StartUp Inc',
        email: 'hello@startup.example.com',
        phone: '+1 (555) 234-5678',
        address: '456 Innovation Ave, Tech Park, TC 23456',
        shop_id: shop.id,
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Local Restaurant',
        email: 'manager@restaurant.example.com',
        phone: '+1 (555) 345-6789',
        address: '789 Main St, Food District, FD 34567',
        shop_id: shop.id,
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Creative Agency',
        email: 'design@creative.example.com',
        phone: '+1 (555) 456-7890',
        address: '321 Design Blvd, Art Quarter, AQ 45678',
        shop_id: shop.id,
      },
    }),
  ]);

  console.log(`✅ Created ${customers.length} demo customers`);

  // Create demo quotes
  const quotes = await Promise.all([
    prisma.quote.create({
      data: {
        customer_id: customers[0].id,
        user_id: salesUser.id,
        product_id: products[0].id,
        quantity: 500,
        specifications: {
          category: 'business-cards',
          card_width_mm: 90,
          card_height_mm: 50,
          sheet_width_mm: 450,
          sheet_height_mm: 320,
          paper_type: 'matte',
          colors: 4,
          finish: 'matte_lamination',
        },
        calculated_cost: 42.25,
        selling_price: 59.15,
        margin_percent: 28.57,
        status: 'sent',
        shop_id: shop.id,
      },
    }),
    prisma.quote.create({
      data: {
        customer_id: customers[1].id,
        user_id: salesUser.id,
        product_id: products[1].id,
        quantity: 1000,
        specifications: {
          category: 'business-cards',
          card_width_mm: 90,
          card_height_mm: 50,
          sheet_width_mm: 450,
          sheet_height_mm: 320,
          paper_type: 'gloss',
          colors: 4,
          finish: 'spot_uv',
        },
        calculated_cost: 78.50,
        selling_price: 109.90,
        margin_percent: 28.57,
        status: 'accepted',
        shop_id: shop.id,
      },
    }),
  ]);

  console.log(`✅ Created ${quotes.length} demo quotes`);

  // Create work order for accepted quote
  const workOrder = await prisma.workOrder.create({
    data: {
      quote_id: quotes[1].id,
      status: 'pending',
      assigned_to: productionUser.id,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      shop_id: shop.id,
    },
  });

  await prisma.workOrderStatusHistory.create({
    data: {
      work_order_id: workOrder.id,
      status: 'pending',
      changed_by: salesUser.id,
    },
  });

  console.log('✅ Created demo work order');

  // Update customer last order date
  await prisma.customer.update({
    where: { id: customers[1].id },
    data: { last_order_date: new Date() },
  });

  console.log('\n🎉 Database seed completed successfully!');
  console.log('\n📧 Demo User Credentials:');
  console.log('  Admin:      admin@demo.printflow.com / Demo123!');
  console.log('  Sales:      sales@demo.printflow.com / Demo123!');
  console.log('  Production: production@demo.printflow.com / Demo123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });