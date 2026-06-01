import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

/**
 * GET /api/investments/csv-template
 * Downloads a CSV template for importing investment heads, assets, or liabilities.
 * Query param: type=heads|assets|liabilities
 */
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'heads';

  let csvContent = '';
  let filename = '';

  if (type === 'heads') {
    csvContent = [
      'Name,Type,Opening Balance,Opening Type,Description,Share Percentage,Capital Value',
      '"Investor Name",Liability,0,None,"Description here",,',
      '"Asset Holder",Asset,0,None,"Description here",,',
      '"Capital Partner",Investment,100000,None,"Initial investment",25,500000',
    ].join('\n');
    filename = 'investment-heads-template.csv';
  } else if (type === 'assets') {
    csvContent = [
      'Investment Head ID,Date,Amount,Asset Category,Asset Sub-Category,Location Tag,Purchase Value,Salvage Value,Useful Life (Months),Depreciation Rate,Description',
      '"head-id-here",2025-01-15,50000,Fixed,Machinery,"Building A",50000,5000,60,10,"Fixed asset description"',
      '"head-id-here",2025-02-01,10000,Current,Cash,,,,,,"Current asset description"',
    ].join('\n');
    filename = 'assets-template.csv';
  } else if (type === 'liabilities') {
    csvContent = [
      'Investment Head ID,Date,Amount,Type,Payment Method,Description',
      '"head-id-here",2025-01-15,25000,received,Cash,"Cash received from investor"',
      '"head-id-here",2025-02-01,10000,pay,Bank Transfer,"Bank transfer payment"',
    ].join('\n');
    filename = 'liabilities-template.csv';
  } else {
    return NextResponse.json({ error: 'Invalid type. Use: heads, assets, or liabilities' }, { status: 400 });
  }

  const bom = '\uFEFF';
  const blob = bom + csvContent;

  return new NextResponse(blob, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8;',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
