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
    """Generate PDF using ReportLab — pure Python, no system dependencies.
    Replaces the earlier WeasyPrint-based version which failed silently on
    Render's free tier (missing Pango/Cairo system libraries)."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                     Paragraph, Spacer)
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)

    GREEN = colors.HexColor("#0F6E56")
    GREEN_FILL = colors.HexColor("#E1F5EE")
    GRAY_FILL  = colors.HexColor("#F1EFE8")
    BORDER     = colors.HexColor("#CCCCCC")

    doc = SimpleDocTemplate(
        tmp.name, pagesize=landscape(A4),
        topMargin=10*mm, bottomMargin=10*mm,
        leftMargin=10*mm, rightMargin=10*mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading2"],
                                  alignment=TA_CENTER, textColor=GREEN, fontSize=14, spaceAfter=2)
    subtitle_style = ParagraphStyle("subtitle", parent=styles["Normal"],
                                     alignment=TA_CENTER, fontSize=8.5, textColor=colors.HexColor("#555555"))
    party_style = ParagraphStyle("party", parent=styles["Normal"], fontSize=7.5, leading=10)
    cell_style  = ParagraphStyle("cell", parent=styles["Normal"], fontSize=7, leading=8.5)
    cell_right  = ParagraphStyle("cellr", parent=cell_style, alignment=TA_RIGHT)
    cell_center = ParagraphStyle("cellc", parent=cell_style, alignment=TA_CENTER)
    words_style = ParagraphStyle("words", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold")

    elements = []

    elements.append(Paragraph(f"RA Bill No. {ra.ra_number} — {project.name}", title_style))
    elements.append(Paragraph(
        f"Invoice No: {ra.invoice_no} | Date: {ra.invoice_date} | WO: {project.wo_number} | HSN: {project.hsn_sac_code}",
        subtitle_style))
    elements.append(Spacer(1, 6))

    # Seller / Buyer / Site blocks
    party_data = [[
        Paragraph(f"<b>Seller:</b><br/>{project.seller_name}<br/>{project.seller_address or ''}<br/>GSTIN: {project.seller_gstin or ''}", party_style),
        Paragraph(f"<b>Buyer:</b><br/>{project.client_name}<br/>{project.client_address or ''}<br/>GSTIN: {project.client_gstin or ''}", party_style),
        Paragraph(f"<b>Site:</b><br/>{project.site_name or project.client_name}<br/>{project.site_address or ''}", party_style),
    ]]
    party_table = Table(party_data, colWidths=[90*mm, 90*mm, 90*mm])
    party_table.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID", (0,0), (-1,-1), 0.5, BORDER),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    elements.append(party_table)
    elements.append(Spacer(1, 8))

    # Line items table
    headers = ["Sr.", "Description", "Unit", "PO Qty", "Rate",
               "Prev Qty", "Prev Amt", "This Qty", "This Amt",
               "Upto Qty", "Upto Amt", "Bal Qty", "Bal Amt"]
    table_data = [[Paragraph(f"<b>{h}</b>", cell_center) for h in headers]]

    for li in line_items:
        desc = li["description"][:150]
        table_data.append([
            Paragraph(str(li["sr_no"]), cell_center),
            Paragraph(desc, cell_style),
            Paragraph(li["unit"], cell_center),
            Paragraph(f"{li['po_qty']:,.3f}", cell_right),
            Paragraph(f"{li['rate']:,.2f}", cell_right),
            Paragraph(f"{li['qty_prev']:,.3f}", cell_right),
            Paragraph(f"{li['amount_prev']:,.2f}", cell_right),
            Paragraph(f"{li['qty_this']:,.3f}", cell_right),
            Paragraph(f"{li['amount_this']:,.2f}", cell_right),
            Paragraph(f"{li['qty_upto']:,.3f}", cell_right),
            Paragraph(f"{li['amount_upto']:,.2f}", cell_right),
            Paragraph(f"{li['qty_balance']:,.3f}", cell_right),
            Paragraph(f"{li['amount_balance']:,.2f}", cell_right),
        ])

    col_widths = [10*mm, 55*mm, 12*mm, 16*mm, 16*mm, 16*mm, 18*mm, 16*mm, 18*mm, 16*mm, 18*mm, 16*mm, 18*mm]
    items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), GREEN_FILL),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("LEFTPADDING", (0,0), (-1,-1), 3),
        ("RIGHTPADDING", (0,0), (-1,-1), 3),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 10))

    # Summary table (right-aligned, ~60% width)
    summary_rows = [
        ["Supply value (this bill)", f"Rs. {float(ra.supply_value_this):,.2f}", False],
        ["E&C value (this bill)", f"Rs. {float(ra.ec_value_this):,.2f}", False],
        ["Taxable value", f"Rs. {float(ra.taxable_value):,.2f}", True],
    ]
    if float(ra.igst_amount) > 0:
        summary_rows.append([f"IGST @ {project.igst_rate}%", f"Rs. {float(ra.igst_amount):,.2f}", False])
    if float(ra.cgst_amount) > 0:
        summary_rows.append([f"CGST @ {project.cgst_rate}%", f"Rs. {float(ra.cgst_amount):,.2f}", False])
        summary_rows.append([f"SGST @ {project.sgst_rate}%", f"Rs. {float(ra.sgst_amount):,.2f}", False])
    summary_rows.append(["Gross total", f"Rs. {float(ra.gross_total):,.2f}", True])
    summary_rows.append([f"Less: Advance recovery ({project.pt_advance_pct}%)", f"Rs. {float(ra.advance_recovery):,.2f}", False])
    if float(ra.retention_deduction) > 0:
        summary_rows.append([f"Less: Retention ({project.pt_retention_pct}%)", f"Rs. {float(ra.retention_deduction):,.2f}", False])
    summary_rows.append(["Net payable", f"Rs. {float(ra.net_payable):,.2f}", True])

    summary_style = ParagraphStyle("summary", parent=styles["Normal"], fontSize=9)
    summary_style_b = ParagraphStyle("summaryb", parent=summary_style, fontName="Helvetica-Bold")
    summary_right = ParagraphStyle("summaryr", parent=summary_style, alignment=TA_RIGHT)
    summary_right_b = ParagraphStyle("summaryrb", parent=summary_style_b, alignment=TA_RIGHT)

    summary_data = []
    for label, value, bold in summary_rows:
        summary_data.append([
            Paragraph(label, summary_style_b if bold else summary_style),
            Paragraph(value, summary_right_b if bold else summary_right),
        ])

    summary_table = Table(summary_data, colWidths=[130*mm, 50*mm], hAlign="RIGHT")
    sstyle_cmds = [
        ("GRID", (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ]
    # Highlight the "Net payable" row (last row)
    sstyle_cmds.append(("BACKGROUND", (0, len(summary_data)-1), (-1, len(summary_data)-1), GREEN_FILL))
    summary_table.setStyle(TableStyle(sstyle_cmds))
    elements.append(summary_table)
    elements.append(Spacer(1, 10))

    elements.append(Paragraph(
        f"Amount in words: {amount_in_words(float(ra.net_payable))}", words_style))
    elements.append(Spacer(1, 20))

    # Signatory footer
    footer_data = [[
        Paragraph(f"For {project.client_name}<br/><br/><br/>Authorised Signatory", party_style),
        Paragraph(f"For {project.seller_name}<br/><br/><br/>Authorised Signatory", party_style),
    ]]
    footer_table = Table(footer_data, colWidths=[140*mm, 140*mm])
    footer_table.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    elements.append(footer_table)

    doc.build(elements)
    tmp.close()
    return tmp.name
