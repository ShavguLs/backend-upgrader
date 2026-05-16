export interface PlisioCallbackPayload {
  status: string;
  txn_id: string;
  order_number: string;
  amount: string;
  source_amount: string;
  source_currency: string;
  currency: string;
  verify_hash: string;
  [key: string]: any;
}
