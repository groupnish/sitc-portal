import os
import tempfile
from decimal import Decimal
from datetime import date
import openpyxl
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter


def amount_in_words(amount):
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
            "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
            "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def _below_thousand(n):
        if n == 0: return ""
        elif n < 20: return ones[n] + " "
        elif n < 100: return tens[n // 10] + (" " + ones[n % 10] if n % 10 else "") + " "
        else: return ones[n // 100] + " Hundred " + _below_thousand(n % 100)

    amount = int(round(amount))
    if amount == 0: return "Zero Rupees Only"
    crore = amount // 10000000; amount %= 10000000
    lakh  = amount // 100000;   amount %= 100000
    thou  = amount // 1000;     amount %= 1000
    hund  = amount

    result = ""
    if crore: result += _below_thousand(crore) + "Crore "
    if lakh:  result += _below_thousand(lakh)  + "Lakh "
    if thou:  result += _below_thousand(thou)  + "Thousand "
    if hund:  result += _below_thousand(hund)
    return result.strip() + " Rupees Only"


def generate_ra_excel(ra, project, line_items):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "RA Bill"

    # Styles
    hdr_font  = Font(bold=True, size=11)
    title_font = Font(bold=True, size=13)
    green_fill = PatternFill("solid", fgColor="E1F5EE")
    gray_fill  = PatternFill("solid", fgColor="F1EFE8")
    thin = Side(style="thin")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    right  = Alignment(horizontal="right", vertical="center")
    left   = Alignment(horizontal="left",  vertical="center", wrap_text=True)

    def cell(row, col, value="", bold=False, fill=None, align=center, fmt=None):
        c = ws.cell(row=row, column=col, value=value)
        if bold: c.font = Font(bold=True, size=10)
        else:    c.font = Font(size=10)
        if fill: c.fill = fill
        c.alignment = align
        c.border = border
        if fmt:  c.number_format = fmt
        return c

    # Column widths
    col_widths = [6, 60, 8, 10, 12, 10, 12, 10, 12, 10, 12, 10, 12]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    r = 1
    # Title
    ws.merge_cells(f"A{r}:M{r}")
    c = ws.cell(r, 1, f"RA BILL No. {ra.ra_number} — {project.name}")
    c.font = title_font; c.alignment = center; c.fill = green_fill; c.border = border
    r += 1

    ws.merge_cells(f"A{r}:M{r}")
    c = ws.cell(r, 1, f"Invoice No: {ra.invoice_no}   |   Date: {ra.invoice_date}   |   WO: {project.wo_number}")
    c.font = Font(size=10); c.alignment = center; c.border = border
    r += 1

    # Party details
    ws.merge_cells(f"A{r}:F{r+2}")
    c = ws.cell(r, 1, f"SELLER: {project.seller_name}\n{project.seller_address}\nGSTIN: {project.seller_gstin}")
    c.alignment = Alignment(wrap_text=True, vertical="top")
    c.font = Font(size=9); c.border = border

    ws.merge_cells(f"G{r}:M{r+2}")
    c = ws.cell(r, 7, f"BUYER: {project.client_name}\n{project.client_address}\nGSTIN: {project.client_gstin}")
    c.alignment = Alignment(wrap_text=True, vertical="top")
    c.font = Font(size=9); c.border = border
    r += 3

    # BOQ Header
    headers = ["Sr.", "Description", "Unit", "PO Qty", "Rate",
               "Prev Qty", "Prev Amt", "This Qty", "This Amt",
               "Upto Qty", "Upto Amt", "Bal Qty", "Bal Amt"]
    for i, h in enumerate(headers, 1):
        cell(r, i, h, bold=True, fill=gray_fill)
    r += 1

    # Line items
    supply_this = Decimal(0)
    ec_this = Decimal(0)
    for li in line_items:
        cell(r, 1, li["sr_no"], align=center)
        cell(r, 2, li["description"][:200], align=left)
        cell(r, 3, li["unit"], align=center)
        cell(r, 4, li["po_qty"], align=right, fmt="#,##0.000")
        cell(r, 5, li["rate"], align=right, fmt="#,##0.00")
        cell(r, 6, li["qty_prev"], align=right, fmt="#,##0.000")
        cell(r, 7, li["amount_prev"], align=right, fmt="#,##0.00")
        cell(r, 8, li["qty_this"], align=right, fmt="#,##0.000")
        cell(r, 9, li["amount_this"], align=right, fmt="#,##0.00")
        cell(r, 10, li["qty_upto"], align=right, fmt="#,##0.000")
        cell(r, 11, li["amount_upto"], align=right, fmt="#,##0.00")
        cell(r, 12, li["qty_balance"], align=right, fmt="#,##0.000")
        cell(r, 13, li["amount_balance"], align=right, fmt="#,##0.00")
        r += 1

    # Summary rows
    r += 1
    def summary_row(label, value, bold=False, fill=None):
        nonlocal r
        ws.merge_cells(f"A{r}:J{r}")
        c = ws.cell(r, 1, label)
        c.font = Font(bold=bold, size=10)
        c.alignment = right; c.border = border
        if fill: c.fill = fill
        c2 = ws.cell(r, 11, value)
        ws.merge_cells(f"K{r}:M{r}")
        c2.font = Font(bold=bold, size=10)
        c2.alignment = right; c2.border = border; c2.number_format = "#,##0.00"
        if fill: c2.fill = fill
        r += 1

    summary_row("Supply value (this bill)", float(ra.supply_value_this))
    summary_row("E&C value (this bill)", float(ra.ec_value_this))
    summary_row("Taxable value", float(ra.taxable_value), bold=True)
    if float(ra.igst_amount) > 0:
        summary_row(f"IGST @ {project.igst_rate}%", float(ra.igst_amount))
    if float(ra.cgst_amount) > 0:
        summary_row(f"CGST @ {project.cgst_rate}%", float(ra.cgst_amount))
        summary_row(f"SGST @ {project.sgst_rate}%", float(ra.sgst_amount))
    summary_row("Gross total", float(ra.gross_total), bold=True)
    summary_row(f"Less: Advance recovery ({project.pt_advance_pct}%)", -float(ra.advance_recovery))
    if float(ra.retention_deduction) > 0:
        summary_row(f"Less: Retention ({project.pt_retention_pct}%)", -float(ra.retention_deduction))
    summary_row("Net payable", float(ra.net_payable), bold=True, fill=green_fill)

    r += 1
    ws.merge_cells(f"A{r}:M{r}")
    c = ws.cell(r, 1, f"Amount in words: {amount_in_words(float(ra.net_payable))}")
    c.font = Font(bold=True, size=10); c.alignment = left; c.border = border
    r += 1

    ws.merge_cells(f"A{r}:M{r}")
    c = ws.cell(r, 1, f"HSN/SAC: {project.hsn_sac_code}   |   Place of Supply: {project.place_of_supply}")
    c.font = Font(size=9); c.alignment = center; c.border = border

    # Freeze panes
    ws.freeze_panes = "A8"

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    wb.save(tmp.name)
    tmp.close()
    return tmp.name


def generate_ra_pdf(ra, project, line_items):
    """Generate PDF using WeasyPrint from HTML template."""
    try:
        from weasyprint import HTML as WP_HTML
    except ImportError:
        return None

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <style>
      body {{ font-family: Arial, sans-serif; font-size: 9pt; margin: 10mm; }}
      h2 {{ text-align: center; font-size: 13pt; color: #0F6E56; margin-bottom: 4px; }}
      .subtitle {{ text-align: center; font-size: 9pt; color: #555; margin-bottom: 8px; }}
      .parties {{ display: flex; gap: 16px; margin-bottom: 8px; }}
      .party {{ flex: 1; border: 0.5px solid #ccc; padding: 6px; border-radius: 4px; font-size: 8pt; }}
      table {{ width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 8px; }}
      th {{ background: #E1F5EE; border: 0.5px solid #aaa; padding: 4px 3px; text-align: center; font-size: 7.5pt; }}
      td {{ border: 0.5px solid #ccc; padding: 3px; }}
      .num {{ text-align: right; }}
      .cen {{ text-align: center; }}
      .desc {{ max-width: 180px; }}
      .summary-table {{ width: 60%; margin-left: auto; margin-top: 10px; }}
      .summary-table td {{ padding: 3px 6px; }}
      .total-row td {{ font-weight: bold; background: #E1F5EE; }}
      .words {{ margin-top: 8px; font-weight: bold; font-size: 9pt; border: 0.5px solid #ccc; padding: 5px; border-radius: 4px; }}
      .footer {{ margin-top: 16px; display: flex; justify-content: space-between; font-size: 8pt; }}
    </style>
    </head>
    <body>
    <h2>RA Bill No. {ra.ra_number} — {project.name}</h2>
    <div class="subtitle">Invoice No: {ra.invoice_no} | Date: {ra.invoice_date} | WO: {project.wo_number} | HSN: {project.hsn_sac_code}</div>

    <div class="parties">
      <div class="party"><b>Seller:</b><br>{project.seller_name}<br>{project.seller_address or ""}<br>GSTIN: {project.seller_gstin or ""}</div>
      <div class="party"><b>Buyer:</b><br>{project.client_name}<br>{project.client_address or ""}<br>GSTIN: {project.client_gstin or ""}</div>
      <div class="party"><b>Site:</b><br>{project.site_name or project.client_name}<br>{project.site_address or ""}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Sr.</th><th>Description</th><th>Unit</th><th>PO Qty</th><th>Rate</th>
          <th>Prev Qty</th><th>Prev Amt</th>
          <th>This Qty</th><th>This Amt</th>
          <th>Upto Qty</th><th>Upto Amt</th>
          <th>Bal Qty</th><th>Bal Amt</th>
        </tr>
      </thead>
      <tbody>
    """
    for li in line_items:
        desc = li["description"][:150]
        html += f"""
        <tr>
          <td class="cen">{li["sr_no"]}</td>
          <td class="desc">{desc}</td>
          <td class="cen">{li["unit"]}</td>
          <td class="num">{li["po_qty"]:,.3f}</td>
          <td class="num">{li["rate"]:,.2f}</td>
          <td class="num">{li["qty_prev"]:,.3f}</td>
          <td class="num">{li["amount_prev"]:,.2f}</td>
          <td class="num">{li["qty_this"]:,.3f}</td>
          <td class="num">{li["amount_this"]:,.2f}</td>
          <td class="num">{li["qty_upto"]:,.3f}</td>
          <td class="num">{li["amount_upto"]:,.2f}</td>
          <td class="num">{li["qty_balance"]:,.3f}</td>
          <td class="num">{li["amount_balance"]:,.2f}</td>
        </tr>"""

    html += f"""
      </tbody>
    </table>

    <table class="summary-table">
      <tr><td>Supply value (this bill)</td><td class="num">₹{float(ra.supply_value_this):,.2f}</td></tr>
      <tr><td>E&C value (this bill)</td><td class="num">₹{float(ra.ec_value_this):,.2f}</td></tr>
      <tr><td><b>Taxable value</b></td><td class="num"><b>₹{float(ra.taxable_value):,.2f}</b></td></tr>
    """
    if float(ra.igst_amount) > 0:
        html += f"<tr><td>IGST @ {project.igst_rate}%</td><td class='num'>₹{float(ra.igst_amount):,.2f}</td></tr>"
    if float(ra.cgst_amount) > 0:
        html += f"<tr><td>CGST @ {project.cgst_rate}%</td><td class='num'>₹{float(ra.cgst_amount):,.2f}</td></tr>"
        html += f"<tr><td>SGST @ {project.sgst_rate}%</td><td class='num'>₹{float(ra.sgst_amount):,.2f}</td></tr>"
    html += f"""
      <tr><td><b>Gross total</b></td><td class="num"><b>₹{float(ra.gross_total):,.2f}</b></td></tr>
      <tr><td>Less: Advance recovery ({project.pt_advance_pct}%)</td><td class="num">₹{float(ra.advance_recovery):,.2f}</td></tr>
    """
    if float(ra.retention_deduction) > 0:
        html += f"<tr><td>Less: Retention ({project.pt_retention_pct}%)</td><td class='num'>₹{float(ra.retention_deduction):,.2f}</td></tr>"
    html += f"""
      <tr class="total-row"><td>Net payable</td><td class="num">₹{float(ra.net_payable):,.2f}</td></tr>
    </table>

    <div class="words">Amount in words: {amount_in_words(float(ra.net_payable))}</div>

    <div class="footer">
      <div>For {project.client_name}<br><br><br>Authorised Signatory</div>
      <div>For {project.seller_name}<br><br><br>Authorised Signatory</div>
    </div>
    </body></html>
    """

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    WP_HTML(string=html).write_pdf(tmp.name)
    tmp.close()
    return tmp.name
