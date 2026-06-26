export function isMobile() {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function openWhatsApp(phone, message) {
  const clean  = phone.replace(/[^0-9]/g, '')
  const encoded = encodeURIComponent(message)
  const url = isMobile()
    ? `https://wa.me/${clean}?text=${encoded}`
    : `https://web.whatsapp.com/send?phone=${clean}&text=${encoded}`
  window.open(url, '_blank')
}

export function grnWhatsAppMsg(grn, project) {
  return `*GRN Created — ${project.code}*\n` +
    `GRN No: ${grn.grn_number}\n` +
    `Date: ${grn.grn_date}\n` +
    `Item: ${grn.boq_item_sr} — ${grn.boq_item_desc}\n` +
    `Qty: ${grn.qty_received} ${grn.unit}\n` +
    `Vendor: ${grn.vendor_name}\n` +
    `Challan: ${grn.challan_no}`
}

export function dispatchWhatsAppMsg(dn, project) {
  return `*Dispatch Note — ${project.code}*\n` +
    `DN No: ${dn.dn_number}\n` +
    `Date: ${dn.dispatch_date}\n` +
    `Item: ${dn.boq_item_sr} — ${dn.boq_item_desc}\n` +
    `Qty: ${dn.qty_dispatched} ${dn.unit}\n` +
    `Site: ${dn.site_destination}\n` +
    `Vehicle: ${dn.vehicle_no}\n` +
    `Amount: ₹${Number(dn.amount).toLocaleString('en-IN')}`
}

export function raWhatsAppMsg(ra, project) {
  return `*RA Bill #${ra.ra_number} — ${project.code}*\n` +
    `Invoice: ${ra.invoice_no}\n` +
    `Date: ${ra.invoice_date}\n` +
    `Taxable: ₹${Number(ra.taxable_value).toLocaleString('en-IN')}\n` +
    `IGST 18%: ₹${Number(ra.igst_amount).toLocaleString('en-IN')}\n` +
    `Net Payable: ₹${Number(ra.net_payable).toLocaleString('en-IN')}`
}

export function progressWhatsAppMsg(count, project) {
  return `*Site Progress Updated — ${project.code}*\n` +
    `${count} item(s) updated.\n` +
    `Please review and prepare RA bill if milestone reached.`
}
