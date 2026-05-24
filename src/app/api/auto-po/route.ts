import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/auto-po - Find products below reorder level and suggest PO quantities
export async function GET() {
  try {
    // Get all active products
    const products = await db.product.findMany({
      include: {
        category: true,
        godown: true,
        company: true,
      },
      where: { isActive: true },
    });

    // Get all stock entries
    const stockEntries = await db.stockEntry.findMany({
      select: {
        productId: true,
        type: true,
        quantity: true,
      },
    });

    // Build stock map
    const stockMap = new Map<string, number>();
    for (const entry of stockEntries) {
      const current = stockMap.get(entry.productId) || 0;
      if (entry.type === 'IN') {
        stockMap.set(entry.productId, current + entry.quantity);
      } else if (entry.type === 'OUT') {
        stockMap.set(entry.productId, current - entry.quantity);
      }
    }

    // Filter products below reorder level and calculate suggested quantity
    const safetyBuffer = 10;
    const autoPOItems = products
      .filter((product) => {
        const stockMovements = stockMap.get(product.id) || 0;
        const currentStock = product.openingStock + stockMovements;
        return currentStock < product.reorderLevel;
      })
      .map((product) => {
        const stockMovements = stockMap.get(product.id) || 0;
        const currentStock = product.openingStock + stockMovements;
        const suggestedQuantity =
          product.reorderLevel - currentStock + safetyBuffer;

        return {
          productId: product.id,
          productCode: product.productCode,
          productName: product.name,
          category: product.category?.name || 'Uncategorized',
          godown: product.godown?.name || 'Unassigned',
          currentStock,
          reorderLevel: product.reorderLevel,
          suggestedQuantity: Math.max(suggestedQuantity, 0),
          costPrice: product.costPrice,
          estimatedCost: Math.max(suggestedQuantity, 0) * product.costPrice,
        };
      });

    return NextResponse.json(autoPOItems);
  } catch (error) {
    console.error('Error generating auto PO suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate auto PO suggestions' },
      { status: 500 }
    );
  }
}
