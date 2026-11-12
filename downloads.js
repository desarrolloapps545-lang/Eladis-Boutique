import { supabase, formatDateOnlyLocal } from './app.js';

// Descargar mini factura como JPG
// Corregido para iOS (Safari): usa location.href en lugar de link.click(),
// que no dispara descargas fiables en iPhone.
export async function downloadMiniInvoice(saleId, index, saleData = null, ctx = {}) {
    const { salesList, getSaleItems, formatCurrency } = ctx;
    const sale = saleData || (salesList && salesList[index]);
    if (!sale) return;

    const client = sale.client_data || {};
    const items = (getSaleItems || getSaleItemsFromSale)(sale);

    // Fetch product categories for all references
    let productCategories = {};
    for (const item of items) {
        const ref = item.reference;
        try {
            const { data: productData } = await supabase
                .from('products')
                .select('*')
                .eq('reference', ref)
                .maybeSingle();
            if (productData) {
                productCategories[ref] = productData.categoria || productData.categoria || '—';
            }
        } catch (err) {
            console.warn('Error fetching product:', ref, err);
        }
    }

    // Generar imagen directamente en canvas
    const canvas = document.createElement('canvas');
    const ctxDraw = canvas.getContext('2d');
    const scale = 2;
    const width = 400;
    const padding = 24;

    // Canvas inicial alto para asegurar espacio (se recortará al final)
    const initialHeight = 1000;

    canvas.width = width * scale;
    canvas.height = initialHeight * scale;
    ctxDraw.scale(scale, scale);

    // Fondo blanco
    ctxDraw.fillStyle = '#ffffff';
    ctxDraw.fillRect(0, 0, width, initialHeight);

    let y = padding;

    // Funciones helper para dibujar
    const drawText = (text, x, y, options = {}) => {
        ctxDraw.font = `${options.weight || '400'} ${options.size || 11}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctxDraw.fillStyle = options.color || '#1a1a2e';
        ctxDraw.textAlign = options.align || 'left';
        ctxDraw.fillText(text, x, y);
    };

    const drawSectionHeader = (text, y) => {
        drawText(text, padding, y, { size: 14, weight: '600', color: '#374151' });
        return y + 20;
    };

    const drawRow = (label, value, y) => {
        drawText(label, padding, y, { size: 14, color: '#6b7280' });
        drawText(value, width - padding, y, {
            size: 14, weight: '500', color: '#1a1a2e', align: 'right'
        });
        return y + 22;
    };

    const drawDivider = (y) => {
        ctxDraw.strokeStyle = '#e5e7eb';
        ctxDraw.lineWidth = 1;
        ctxDraw.beginPath();
        ctxDraw.moveTo(padding, y);
        ctxDraw.lineTo(width - padding, y);
        ctxDraw.stroke();
        return y + 12;
    };

    const formatDate = (iso) => formatDateOnlyLocal(iso);

    // Header: Solo imagen del logo (centrada y grande)
    const logoImg = new Image();
    logoImg.src = 'img/logo_eladis_boutique.png';
    await new Promise(resolve => {
        if (logoImg.complete) resolve();
        else logoImg.onload = resolve;
    });
    const logoSize = 112;
    // Calcular posición para centrar horizontalmente
    const centerX = width / 2 - logoSize / 2;
    const centerY = y;
    ctxDraw.drawImage(logoImg, centerX, centerY, logoSize, logoSize);
    // Espacio reservado para la ubicación del título debajo del logo
    y = centerY + logoSize + 40;

    y = drawDivider(y + 8);

    // Sección: Información de la Venta
    y = drawSectionHeader('INFORMACIÓN DE LA VENTA', y);
    y = drawRow('Fecha:', formatDate(sale.created_at), y);
    y = drawRow('Total:', formatCurrency(sale.total_sale), y);
    y = drawDivider(y + 8);

    // Sección: Producto(s)
    y = drawSectionHeader('PRODUCTO(S)', y);
    items.forEach((item, i) => {
        const productRef = item.reference || '—';
        y = drawRow('Referencia:', productRef, y);
        y = drawRow('Talla:', item.size || '—', y);
        y = drawRow('cantidad:', item.amount !== null && item.amount !== undefined ? String(item.amount) : '—', y);
        if (i < items.length - 1) y += 4;
    });
    y = drawDivider(y + 8);

    // Sección: Cliente
    y = drawSectionHeader('CLIENTE', y);
    y = drawRow('Nombre:', client?.nombre || '—', y);
    y = drawRow('Celular:', client?.celular || '—', y);
    y = drawRow('Dirección:', client?.direccion || '—', y);
    y = drawRow('Tipo de Pago:', client?.tipoPago || client?.payment || '—', y);
    y = drawDivider(y + 8);

    // Footer
    // (sin texto de generado automáticamente)

    // Recortar canvas a la altura real usada (el canvas origen está en 2x, así que multiplicamos por scale)
    const finalHeight = y + 30;
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');
    finalCanvas.width = width * scale;
    finalCanvas.height = finalHeight * scale;
    // Copiar píxeles exactos del canvas origen (que está en 2x) al canvas final (también 2x)
    finalCtx.drawImage(canvas, 0, 0, width * scale, finalHeight * scale, 0, 0, width * scale, finalHeight * scale);

    // Descargar como JPG (compatible con iOS/iPhone)
    const link = document.createElement('a');
    const isCustomDownload = client && client.is_custom;
    const safeRef = (items[0]?.reference || 'venta').replace(/[^a-zA-Z0-9]/g, '_');
    const safeClient = (client?.nombre || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
    link.download = isCustomDownload
        ? `mini-factura-personalizado-${safeRef}-${safeClient}-${Date.now()}.jpg`
        : `mini-factura-${safeRef}-${safeClient}-${Date.now()}.jpg`;
    link.href = finalCanvas.toDataURL('image/jpeg', 0.95);

    // iOS Safari no descarga confiablemente con link.click().
    // Usar location.href solo cuando sea absolutely necesario y después de tener una URL blob.
    // Este método intenta usar un blob temporal en lugar de data URLs para evitar restricciones del navegador.
    try {
        const blob = await fetch(link.href).then(r => r.blob());
        const blobUrl = URL.createObjectURL(blob);
        const tempLink = document.createElement('a');
        tempLink.href = blobUrl;
        tempLink.download = link.download;
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
        // Si el método del blob falla, intentamos click directamente como último recurso.
        try {
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e2) {
            console.warn('Todos los métodos de download fallaron:', e2);
        }
    }
}

function getSaleItemsFromSale(sale) {
    if (sale.client_data && sale.client_data.items) {
        return sale.client_data.items;
    }
    const items = [];
    const references = sale.reference || [];
    const sizes = sale.size || [];
    const prices = sale.price || [];
    const amounts = sale.amount || [];
    for (let i = 0; i < references.length; i++) {
        items.push({
            reference: references[i],
            size: sizes[i],
            price: prices[i],
            amount: amounts[i]
        });
    }
    return items;
}
