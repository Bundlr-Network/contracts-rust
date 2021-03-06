use bundlr_contracts_shared::{Address, Amount};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub ticker: String,
    pub name: Option<String>,
    pub decimals: u8,
    pub total_supply: Amount,
    pub owner: Address,
    pub balances: HashMap<Address, Amount>,
    pub allowances: HashMap<Address, HashMap<Address, Amount>>,
}
