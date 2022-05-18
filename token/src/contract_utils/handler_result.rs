use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HandlerResult<State, QueryResponseMsg> {
    NewState(State),
    QueryResponse(QueryResponseMsg),
}
