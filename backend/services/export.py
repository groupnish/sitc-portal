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


# ─────────────────────────────────────────────────────────────────────────────
# TAX INVOICE GENERATORS
# ─────────────────────────────────────────────────────────────────────────────

def generate_tax_invoice_pdf(ra, project):
    """Generate GST Tax Invoice PDF using ReportLab — pure Python, no system deps."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)

    GREEN      = colors.HexColor("#0F6E56")
    GREEN_FILL = colors.HexColor("#E1F5EE")
    GRAY_FILL  = colors.HexColor("#F1EFE8")
    BORDER     = colors.HexColor("#CCCCCC")
    RED        = colors.HexColor("#D85A30")

    doc = SimpleDocTemplate(
        tmp.name, pagesize=A4,
        topMargin=10*mm, bottomMargin=10*mm,
        leftMargin=12*mm, rightMargin=12*mm,
    )

    styles = getSampleStyleSheet()
    def ps(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    title_s   = ps("ti", fontSize=13, fontName="Helvetica-Bold", alignment=TA_CENTER, textColor=GREEN)
    sub_s     = ps("su", fontSize=8.5, alignment=TA_CENTER, textColor=colors.HexColor("#555555"))
    hdr_s     = ps("hd", fontSize=8, fontName="Helvetica-Bold")
    cell_s    = ps("ce", fontSize=8, leading=10)
    cell_b    = ps("cb", fontSize=8, fontName="Helvetica-Bold", leading=10)
    cell_r    = ps("cr", fontSize=8, alignment=TA_RIGHT)
    cell_rb   = ps("crb", fontSize=8, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    cell_c    = ps("cc", fontSize=8, alignment=TA_CENTER)
    small_s   = ps("sm", fontSize=7.5, textColor=colors.HexColor("#555555"))
    footer_s  = ps("fo", fontSize=8, textColor=colors.HexColor("#444444"))

    elements = []

    # ── Title ────────────────────────────────────────────────────────────────
    elements.append(Paragraph("TAX INVOICE — RUNNING ACCOUNT (RA) BILL", title_s))
    elements.append(Paragraph(
        "E-invoice with IRN to be generated for this bill (PO clause 16)", sub_s))
    elements.append(Spacer(1, 4))

    # ── Bill meta row ────────────────────────────────────────────────────────
    meta_data = [[
        Paragraph(f"<b>RA Bill No.:</b> {ra.ra_number}", cell_s),
        Paragraph(f"<b>Invoice No.:</b> {ra.invoice_no}", cell_s),
        Paragraph(f"<b>Invoice Date:</b> {ra.invoice_date}", cell_s),
    ],[
        Paragraph(f"<b>W.O. No.:</b> {project.wo_number}", cell_s),
        Paragraph(f"<b>W.O. Date:</b> {project.wo_date or ''}", cell_s),
        Paragraph(f"<b>HSN/SAC:</b> {project.hsn_sac_code}  |  <b>Reverse Charge:</b> No", cell_s),
    ],[
        Paragraph(f"<b>Place of Supply:</b> {project.place_of_supply}", cell_s),
        Paragraph("", cell_s),
        Paragraph("", cell_s),
    ]]
    meta_tbl = Table(meta_data, colWidths=[62*mm, 62*mm, 62*mm])
    meta_tbl.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",  (0,0), (-1,-1), 0.3, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("LEFTPADDING",(0,0),(-1,-1),5),
    ]))
    elements.append(meta_tbl)
    elements.append(Spacer(1, 5))

    # ── Party details ────────────────────────────────────────────────────────
    def party_block(title, name, addr, gstin, pan=None):
        lines = [f"<b>{title}</b>", f"<b>{name}</b>", addr or ""]
        if gstin: lines.append(f"GST No: {gstin}")
        if pan:   lines.append(f"PAN No: {pan}")
        return Paragraph("<br/>".join(lines), cell_s)

    party_data = [[
        party_block("SELLER", project.seller_name, project.seller_address,
                    project.seller_gstin, getattr(project, "seller_pan", None)),
        party_block("BUYER", project.client_name, project.client_address,
                    project.client_gstin, getattr(project, "client_pan", None)),
        party_block("CONSIGNEE / SITE", project.site_name or project.client_name,
                    project.site_address or "", None),
    ]]
    party_tbl = Table(party_data, colWidths=[62*mm, 62*mm, 62*mm])
    party_tbl.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",  (0,0), (-1,-1), 0.3, BORDER),
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING",(0,0),(-1,-1),5),
    ]))
    elements.append(party_tbl)
    elements.append(Spacer(1, 6))

    # ── Abstract of Bill ─────────────────────────────────────────────────────
    elements.append(Paragraph("<b>ABSTRACT OF BILL (Taxable Values)</b>", hdr_s))
    elements.append(Spacer(1, 3))

    order_val_p1 = float(getattr(project, "wo_value_supply", 0) or 0)
    order_val_p2 = float(getattr(project, "wo_value_ec", 0) or 0)
    order_total  = order_val_p1 + order_val_p2

    sup_prev  = float(ra.supply_value_prev)
    sup_this  = float(ra.supply_value_this)
    sup_upto  = float(ra.supply_value_upto)
    ec_prev   = float(ra.ec_value_prev)
    ec_this   = float(ra.ec_value_this)
    ec_upto   = float(ra.ec_value_upto)
    tax_val   = float(ra.taxable_value)
    igst      = float(ra.igst_amount)
    cgst      = float(ra.cgst_amount)
    sgst      = float(ra.sgst_amount)
    gross     = float(ra.gross_total)
    adv_rec   = float(ra.advance_recovery)
    ret_ded   = float(ra.retention_deduction) if hasattr(ra, "retention_deduction") else 0
    net_pay   = float(ra.net_payable)

    def inr(v): return f"Rs. {v:,.2f}"

    abs_headers = [
        Paragraph("<b>Part</b>", cell_b),
        Paragraph("<b>Order Value</b>", cell_rb),
        Paragraph("<b>Up-to-Date Billed</b>", cell_rb),
        Paragraph("<b>Previous Billed</b>", cell_rb),
        Paragraph("<b>THIS BILL</b>", cell_rb),
    ]
    abs_data = [
        abs_headers,
        [Paragraph("Part 1 — Balance Supply (SITC)", cell_s),
         Paragraph(inr(order_val_p1), cell_r),
         Paragraph(inr(sup_upto), cell_r),
         Paragraph(inr(sup_prev), cell_r),
         Paragraph(inr(sup_this), cell_r)],
        [Paragraph("Part 2 — Installation & Commissioning", cell_s),
         Paragraph(inr(order_val_p2), cell_r),
         Paragraph(inr(ec_upto), cell_r),
         Paragraph(inr(ec_prev), cell_r),
         Paragraph(inr(ec_this), cell_r)],
        [Paragraph("<b>TOTAL TAXABLE AMOUNT</b>", cell_b),
         Paragraph(inr(order_total), cell_rb),
         Paragraph(inr(sup_upto + ec_upto), cell_rb),
         Paragraph(inr(sup_prev + ec_prev), cell_rb),
         Paragraph(inr(tax_val), cell_rb)],
    ]
    abs_tbl = Table(abs_data, colWidths=[65*mm, 30*mm, 35*mm, 30*mm, 26*mm])
    abs_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), GRAY_FILL),
        ("BACKGROUND", (0,3), (-1,3), GREEN_FILL),
        ("BOX",        (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",  (0,0), (-1,-1), 0.3, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("LEFTPADDING",(0,0),(-1,-1),4),
        ("RIGHTPADDING",(0,0),(-1,-1),4),
    ]))
    elements.append(abs_tbl)
    elements.append(Spacer(1, 4))

    # ── Tax & Summary block ──────────────────────────────────────────────────
    def summary_row(label, value, bold=False, color=None):
        ls = cell_b if bold else cell_s
        rs = cell_rb if bold else cell_r
        p  = Paragraph(f"<b>{label}</b>" if bold else label, ls)
        v  = Paragraph(f"<b>{inr(value)}</b>" if bold else inr(value), rs)
        return [p, v]

    sum_data = []
    if igst > 0:
        sum_data.append(summary_row(f"IGST @ {project.igst_rate}%", igst))
    if cgst > 0:
        sum_data.append(summary_row(f"CGST @ {project.cgst_rate}%", cgst))
        sum_data.append(summary_row(f"SGST @ {project.sgst_rate}%", sgst))
    sum_data.append(summary_row("TOTAL INVOICE VALUE (incl. GST)", gross, bold=True))
    sum_data.append(summary_row(
        f"Less: Advance adjusted ({project.pt_advance_pct}% of Part-1 this bill)", adv_rec))
    if ret_ded > 0:
        sum_data.append(summary_row(
            f"Less: Retention ({project.pt_retention_pct}%)", ret_ded))
    sum_data.append(summary_row("NET AMOUNT RECEIVABLE", net_pay, bold=True))

    sum_tbl = Table(sum_data, colWidths=[130*mm, 56*mm], hAlign="RIGHT")
    sstyle = [
        ("BOX",        (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",  (0,0), (-1,-1), 0.3, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("LEFTPADDING",(0,0),(-1,-1),5),
        ("RIGHTPADDING",(0,0),(-1,-1),5),
    ]
    # Highlight net payable row (last row)
    sstyle.append(("BACKGROUND", (0, len(sum_data)-1), (-1, len(sum_data)-1), GREEN_FILL))
    sum_tbl.setStyle(TableStyle(sstyle))
    elements.append(sum_tbl)
    elements.append(Spacer(1, 6))

    # ── Amount in words ──────────────────────────────────────────────────────
    elements.append(Paragraph(
        f"<b>Invoice Value in Words:</b> {amount_in_words(gross)} (incl. GST)", cell_b))
    elements.append(Paragraph(
        f"<b>Net Amount Receivable in Words:</b> {amount_in_words(net_pay)}", cell_b))
    elements.append(Spacer(1, 8))

    # ── Payment terms + signatory ─────────────────────────────────────────────
    pay_terms = [
        getattr(project, "pt_part1_terms", "20% advance (received) + 80% through 60-days usance LC from shipment date"),
        getattr(project, "pt_part2_terms", "80% on installation + 20% on commissioning, pro-rata, 15 days from RA bill certification"),
    ]
    footer_data = [[
        Paragraph("<br/>".join([
            "<b>Payment Terms:</b>",
            f"Part-1: {pay_terms[0]}",
            f"Part-2: {pay_terms[1]}",
            "",
            "Certified that the particulars given above are true and correct and the amount",
            "claimed is as per actual work executed.  E. & O. E.",
        ]), footer_s),
        Paragraph(
            "For <b>NISH TECHNO PROJECTS PRIVATE LIMITED</b>"
            "<br/><br/><br/><br/>Authorised Signatory", footer_s),
    ]]
    footer_tbl = Table(footer_data, colWidths=[100*mm, 86*mm])
    footer_tbl.setStyle(TableStyle([
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ("BOX",        (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",  (0,0), (-1,-1), 0.3, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1),20),
        ("LEFTPADDING",(0,0),(-1,-1),6),
    ]))
    elements.append(footer_tbl)

    doc.build(elements)
    tmp.close()
    return tmp.name


def generate_tax_invoice_excel(ra, project):
    """Generate GST Tax Invoice as formatted Excel file."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Tax Invoice"

    from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
    from openpyxl.utils import get_column_letter

    thin  = Side(style="thin")
    bdr   = Border(left=thin, right=thin, top=thin, bottom=thin)
    C     = Alignment(horizontal="center", vertical="center", wrap_text=True)
    L     = Alignment(horizontal="left", vertical="center", wrap_text=True)
    R     = Alignment(horizontal="right", vertical="center")
    GREEN_FILL = PatternFill("solid", fgColor="E1F5EE")
    GRAY_FILL  = PatternFill("solid", fgColor="F1EFE8")
    TEAL_FILL  = PatternFill("solid", fgColor="0F6E56")

    col_widths = [4, 28, 18, 18, 18, 18, 4]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    def sc(r, c, val="", bold=False, fill=None, align=L, fmt=None, size=10, color="000000"):
        cell = ws.cell(row=r, column=c, value=val)
        cell.font = Font(bold=bold, size=size, name="Arial", color=color)
        if fill: cell.fill = fill
        cell.alignment = align
        cell.border = bdr
        if fmt: cell.number_format = fmt
        return cell

    def merge(r, c1, c2, val="", bold=False, fill=None, align=C, size=10, color="000000"):
        ws.merge_cells(start_row=r, start_column=c1, end_row=r, end_column=c2)
        return sc(r, c1, val, bold, fill, align, size=size, color=color)

    r = 1
    merge(r, 1, 6, "TAX INVOICE — RUNNING ACCOUNT (RA) BILL",
          bold=True, fill=TEAL_FILL, size=13, color="FFFFFF")
    ws.row_dimensions[r].height = 24; r += 1

    merge(r, 1, 6, "E-invoice with IRN to be generated for this bill (PO clause 16)",
          fill=GRAY_FILL, size=9)
    r += 1

    # Meta row
    sc(r, 2, f"RA Bill No.: {ra.ra_number}", bold=True)
    sc(r, 3, f"Invoice No.: {ra.invoice_no}", bold=True)
    sc(r, 4, f"Invoice Date: {ra.invoice_date}", bold=True)
    sc(r, 5, f"HSN/SAC: {project.hsn_sac_code}", bold=True)
    r += 1
    sc(r, 2, f"W.O. No.: {project.wo_number}")
    sc(r, 3, f"Place of Supply: {project.place_of_supply}")
    sc(r, 4, f"Reverse Charge: No")
    sc(r, 5, f"W.O. Date: {project.wo_date or ''}")
    r += 1

    ws.row_dimensions[r].height = 10; r += 1

    # Party block
    headers = ["SELLER", "BUYER", "CONSIGNEE / SITE"]
    for i, h in enumerate(headers):
        sc(r, 2 + i, h, bold=True, fill=GRAY_FILL, align=C)
    r += 1

    party_lines = [
        [project.seller_name, project.client_name, project.site_name or project.client_name],
        [project.seller_address or "", project.client_address or "", project.site_address or ""],
        [f"GSTIN: {project.seller_gstin or ''}", f"GSTIN: {project.client_gstin or ''}", ""],
    ]
    for line in party_lines:
        for i, val in enumerate(line):
            sc(r, 2 + i, val, align=L, size=9)
        ws.row_dimensions[r].height = 20
        r += 1

    ws.row_dimensions[r].height = 10; r += 1

    # Abstract table
    merge(r, 1, 6, "ABSTRACT OF BILL (Taxable Values, Rs.)", bold=True, fill=GRAY_FILL, align=L)
    r += 1

    abs_hdrs = ["Part", "Order Value", "Up-to-Date Billed", "Previous Billed", "THIS BILL", ""]
    for i, h in enumerate(abs_hdrs[:-1], 2):
        sc(r, i, h, bold=True, fill=GRAY_FILL, align=C)
    r += 1

    order_val_p1 = float(getattr(project, "wo_value_supply", 0) or 0)
    order_val_p2 = float(getattr(project, "wo_value_ec", 0) or 0)
    sup_prev = float(ra.supply_value_prev); sup_this = float(ra.supply_value_this)
    sup_upto = float(ra.supply_value_upto)
    ec_prev  = float(ra.ec_value_prev);  ec_this  = float(ra.ec_value_this)
    ec_upto  = float(ra.ec_value_upto)
    tax_val  = float(ra.taxable_value); igst = float(ra.igst_amount)
    cgst = float(ra.cgst_amount); sgst = float(ra.sgst_amount)
    gross    = float(ra.gross_total); adv_rec = float(ra.advance_recovery)
    ret_ded  = float(ra.retention_deduction) if hasattr(ra, "retention_deduction") else 0
    net_pay  = float(ra.net_payable)

    FMT = "#,##0.00"
    rows_data = [
        ("Part 1 — Balance Supply (SITC)", order_val_p1, sup_upto, sup_prev, sup_this),
        ("Part 2 — Installation & Commissioning", order_val_p2, ec_upto, ec_prev, ec_this),
        ("TOTAL TAXABLE AMOUNT", order_val_p1+order_val_p2,
         sup_upto+ec_upto, sup_prev+ec_prev, tax_val),
    ]
    for i, (label, *vals) in enumerate(rows_data):
        fill = GREEN_FILL if i == 2 else None
        bold = i == 2
        sc(r, 2, label, bold=bold, fill=fill, align=L)
        for j, v in enumerate(vals):
            sc(r, 3+j, v, bold=bold, fill=fill, align=R, fmt=FMT)
        r += 1

    ws.row_dimensions[r].height = 8; r += 1

    # Tax summary
    tax_rows = []
    if igst > 0: tax_rows.append((f"IGST @ {project.igst_rate}%", igst, False))
    if cgst > 0:
        tax_rows.append((f"CGST @ {project.cgst_rate}%", cgst, False))
        tax_rows.append((f"SGST @ {project.sgst_rate}%", sgst, False))
    tax_rows.append(("TOTAL INVOICE VALUE (incl. GST)", gross, True))
    tax_rows.append((f"Less: Advance adjusted ({project.pt_advance_pct}% of Part-1 this bill)",
                     adv_rec, False))
    if ret_ded > 0:
        tax_rows.append((f"Less: Retention ({project.pt_retention_pct}%)", ret_ded, False))
    tax_rows.append(("NET AMOUNT RECEIVABLE", net_pay, True))

    for label, val, bold in tax_rows:
        fill = GREEN_FILL if bold and label.startswith("NET") else (GRAY_FILL if bold else None)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
        sc(r, 2, label, bold=bold, fill=fill, align=L)
        ws.merge_cells(start_row=r, start_column=5, end_row=r, end_column=6)
        sc(r, 5, val, bold=bold, fill=fill, align=R, fmt=FMT)
        r += 1

    ws.row_dimensions[r].height = 8; r += 1

    # Amount in words
    merge(r, 1, 6, f"Invoice Value in Words: {amount_in_words(gross)} (incl. GST)",
          bold=True, align=L, size=9)
    r += 1
    merge(r, 1, 6, f"Net Amount Receivable in Words: {amount_in_words(net_pay)}",
          bold=True, align=L, size=9)
    r += 1; ws.row_dimensions[r].height = 8; r += 1

    # Footer
    sc(r, 2, "Certified that the particulars given above are true and correct "
             "and the amount claimed is as per actual work executed.  E. & O. E.", size=9)
    sc(r, 5, "For NISH TECHNO PROJECTS PRIVATE LIMITED", bold=True)
    r += 4
    sc(r, 5, "Authorised Signatory")

    out = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    wb.save(out.name)
    out.close()
    return out.name


def generate_reconciliation_excel(recon_items, project):
    """Export Reconciliation data as formatted Excel."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Reconciliation"

    from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
    from openpyxl.utils import get_column_letter

    thin = Side(style="thin")
    bdr  = Border(left=thin, right=thin, top=thin, bottom=thin)
    C    = Alignment(horizontal="center", vertical="center", wrap_text=True)
    L    = Alignment(horizontal="left",  vertical="center", wrap_text=True)
    R    = Alignment(horizontal="right", vertical="center")
    TEAL = PatternFill("solid", fgColor="0F6E56")
    GRAY = PatternFill("solid", fgColor="F1EFE8")
    GRN  = PatternFill("solid", fgColor="E1F5EE")

    col_ws = [12, 6, 45, 14, 8, 16, 16, 16, 18, 35]
    for i, w in enumerate(col_ws, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    def sc(r, c, val="", bold=False, fill=None, align=L, fmt=None, size=9):
        cell = ws.cell(row=r, column=c, value=val)
        cell.font = Font(bold=bold, size=size, name="Arial",
                         color="FFFFFF" if fill == TEAL else "000000")
        if fill: cell.fill = fill
        cell.alignment = align
        cell.border = bdr
        if fmt: cell.number_format = fmt
        return cell

    r = 1
    ws.merge_cells(f"A{r}:J{r}")
    sc(r, 1,
       f"RECONCILIATION — OLD WO (Gharpure J-2209/WO-249 Amd-2) vs "
       f"NEW PO (BEIL WO-249 Amd-3)",
       bold=True, fill=TEAL, align=C, size=11)
    ws.row_dimensions[r].height = 22; r += 1

    ws.merge_cells(f"A{r}:J{r}")
    sc(r, 1,
       "Frozen audit record. Old-WO billing stays with Gharpure account; "
       "this order covers only balance supply (Part 1) and pending I&C (Part 2) "
       "at re-negotiated rates.",
       fill=GRAY, align=L, size=8)
    ws.row_dimensions[r].height = 18; r += 1

    hdrs = ["Site", "Old Sr.", "Description", "Old Rate", "Old Qty",
            "Billed Supply (Rs.)", "Billed Install (Rs.)", "Billed Comm (Rs.)",
            "Total Billed Old WO (Rs.)", "Disposition in New PO"]
    for i, h in enumerate(hdrs, 1):
        sc(r, i, h, bold=True, fill=GRAY, align=C)
    ws.row_dimensions[r].height = 30; r += 1

    FMT = "#,##0.00"
    for item in recon_items:
        disp = item.get("disposition", "")
        fill = GRN if "Closed" in disp else (GRAY if "DESCOPED" in disp else None)
        sc(r, 1, item.get("site", ""), fill=fill, align=C)
        sc(r, 2, item.get("old_sr", ""), fill=fill, align=C)
        sc(r, 3, item.get("description", ""), fill=fill)
        sc(r, 4, item.get("old_rate", 0), fill=fill, align=R, fmt=FMT)
        sc(r, 5, item.get("old_qty", 0), fill=fill, align=C)
        sc(r, 6, item.get("billed_supply", 0), fill=fill, align=R, fmt=FMT)
        sc(r, 7, item.get("billed_install", 0), fill=fill, align=R, fmt=FMT)
        sc(r, 8, item.get("billed_comm", 0), fill=fill, align=R, fmt=FMT)
        sc(r, 9, item.get("total_billed", 0), fill=fill, align=R, fmt=FMT)
        sc(r, 10, disp, fill=fill)
        ws.row_dimensions[r].height = 18
        r += 1

    out = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    wb.save(out.name)
    out.close()
    return out.name
