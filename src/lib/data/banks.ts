/**
 * Banks operating in India, for the bank-name picker on the intern About Me
 * step and the Settings bank form.
 *
 * Public sector, private sector, small finance, payments, the larger
 * cooperative/regional names and the foreign banks students commonly hold
 * accounts with. Stored as plain text in `extra.bankDetails.bankName`, so a
 * name that is not here (a district cooperative bank, say) is typed in through
 * "Other" and saved exactly as typed - legacy values keep loading.
 */
export const BANKS: string[] = [
  // Public sector
  "State Bank of India",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Indian Bank",
  "Central Bank of India",
  "Indian Overseas Bank",
  "UCO Bank",
  "Bank of Maharashtra",
  "Punjab & Sind Bank",
  // Private sector
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "IndusInd Bank",
  "Yes Bank",
  "IDFC FIRST Bank",
  "IDBI Bank",
  "Federal Bank",
  "Bandhan Bank",
  "RBL Bank",
  "South Indian Bank",
  "Karur Vysya Bank",
  "City Union Bank",
  "Karnataka Bank",
  "Tamilnad Mercantile Bank",
  "DCB Bank",
  "CSB Bank",
  "Dhanlaxmi Bank",
  "Jammu & Kashmir Bank",
  "Nainital Bank",
  // Small finance banks
  "AU Small Finance Bank",
  "Equitas Small Finance Bank",
  "Ujjivan Small Finance Bank",
  "Jana Small Finance Bank",
  "Suryoday Small Finance Bank",
  "ESAF Small Finance Bank",
  "Utkarsh Small Finance Bank",
  "Capital Small Finance Bank",
  "Fincare Small Finance Bank",
  "North East Small Finance Bank",
  "Shivalik Small Finance Bank",
  "Unity Small Finance Bank",
  // Payments banks
  "Airtel Payments Bank",
  "India Post Payments Bank",
  "Fino Payments Bank",
  "Paytm Payments Bank",
  "Jio Payments Bank",
  "NSDL Payments Bank",
  // Cooperative and regional
  "Saraswat Co-operative Bank",
  "Cosmos Co-operative Bank",
  "Abhyudaya Co-operative Bank",
  "TJSB Sahakari Bank",
  "Kerala Gramin Bank",
  "Baroda UP Bank",
  "Andhra Pradesh Grameena Vikas Bank",
  // Foreign banks with retail accounts in India
  "Standard Chartered Bank",
  "HSBC",
  "Citibank",
  "Deutsche Bank",
  "DBS Bank India",
];

