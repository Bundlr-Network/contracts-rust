use std::str::FromStr;

use bundlr_contracts_shared::{
    contract_utils::js_imports::{Contract, SmartWeave},
    Address, Amount,
};
use serde::{Deserialize, Serialize};
use url::Url;
use wasm_bindgen::JsValue;

use crate::{
    action::ActionResult,
    contract_utils::{handler_result::HandlerResult, js_imports::log},
    error::ContractError,
    state::{State, Validator},
};

#[derive(Serialize)]
struct Input {
    function: String,
    from: Address,
    to: Address,
    amount: Amount,
}

#[derive(Debug, Deserialize)]
struct Result {
    #[serde(rename = "type")]
    result_type: String,
}

pub async fn join(mut state: State, stake: Amount, url: Url) -> ActionResult {
    let caller = SmartWeave::caller()
        .parse::<Address>()
        .map_err(|err| ContractError::ParseError(err.to_string()))?;

    if stake < state.minimum_stake {
        return Err(ContractError::InvalidStake);
    }

    if state.validators.contains_key(&caller) {
        return Err(ContractError::AlreadyJoined);
    }

    log("BEFORE TRANSFER");
    let result = SmartWeave::write(
        &state.token.to_string(),
        JsValue::from_serde(&Input {
            function: "transferFrom".to_string(),
            from: caller.clone(),
            to: Address::from_str(&Contract::id())
                .map_err(|err| ContractError::ParseError(err.to_string()))?,
            amount: stake,
        })
        .unwrap(),
    )
    .await;

    log("AFTER TRANSFER");


    let result: Result = result.into_serde().unwrap();
    log(&format!("AFTER TRANSFER RESULT {:?}", result));

    if result.result_type != "ok" {
        return Err(ContractError::TransferFailed);
    }

    state.validators.insert(
        caller.clone(),
        Validator {
            address: caller,
            stake,
            url,
        },
    );

    log("JOINED VALIDATOR");

    Ok(HandlerResult::NewState(state))
}
