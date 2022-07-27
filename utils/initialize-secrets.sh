#!/bin/sh
set -eu

GPG_FINGERPRINT="${1:?}"
SECRETS_FILE="${2:?}"
CREATE_WALLET_CMD="${3:-$CREATE_WALLET_CMD}"
SHOW_ADDRESS_CMD="${4:-$SHOW_ADDESS_CMD}"

echo '{"wallets": {}}' >"${SECRETS_FILE}"
sops --pgp "$GPG_FINGERPRINT" -e -i "${SECRETS_FILE}"

extract_address() {
    sops -d --extract "[\"wallets\"][\"${1}\"]" --output-type json "${SECRETS_FILE}" | ${SHOW_ADDRESS_CMD}
}

sops --set "[\"wallets\"][\"token-contract-owner\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"bundlers-contract-owner\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"bundler-1\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"bundler-2\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"validator-1\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"validator-2\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"validator-3\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"validator-4\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"validator-5\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"validator-6\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"
sops --set "[\"wallets\"][\"validator-7\"] $(${CREATE_WALLET_CMD})" "${SECRETS_FILE}"

TOKEN_CONTRACT_OWNER_ADDRESS="$(extract_address "token-contract-owner" | jq '.address')"
BUNDLERS_CONTRACT_OWNER_ADDRESS="$(extract_address "bundlers-contract-owner" | jq '.address')"
BUNDLER_1_ADDRESS="$(extract_address "bundler-1" | jq '.address')"
BUNDLER_2_ADDRESS="$(extract_address "bundler-2" | jq '.address')"
VALIDATOR_1_ADDRESS="$(extract_address "validator-1" | jq '.address')"
VALIDATOR_2_ADDRESS="$(extract_address "validator-2" | jq '.address')"
VALIDATOR_3_ADDRESS="$(extract_address "validator-3" | jq '.address')"
VALIDATOR_4_ADDRESS="$(extract_address "validator-4" | jq '.address')"
VALIDATOR_5_ADDRESS="$(extract_address "validator-5" | jq '.address')"
VALIDATOR_6_ADDRESS="$(extract_address "validator-6" | jq '.address')"
VALIDATOR_7_ADDRESS="$(extract_address "validator-7" | jq '.address')"

echo "TOKEN_CONTRACT_OWNER_ADDRESS=${TOKEN_CONTRACT_OWNER_ADDRESS}"
echo "BUNDERS_CONTRACT_OWNER_ADDRESS=${BUNDLERS_CONTRACT_OWNER_ADDRESS}"
echo "BUNDLER_1_ADDRESS=${BUNDLER_1_ADDRESS}"
echo "BUNDLER_2_ADDRESS=${BUNDLER_2_ADDRESS}"
echo "VALIDATOR_1_ADDRESS=${VALIDATOR_1_ADDRESS}"
echo "VALIDATOR_2_ADDRESS=${VALIDATOR_2_ADDRESS}"
echo "VALIDATOR_3_ADDRESS=${VALIDATOR_3_ADDRESS}"
echo "VALIDATOR_4_ADDRESS=${VALIDATOR_4_ADDRESS}"
echo "VALIDATOR_5_ADDRESS=${VALIDATOR_5_ADDRESS}"
echo "VALIDATOR_6_ADDRESS=${VALIDATOR_6_ADDRESS}"
echo "VALIDATOR_7_ADDRESS=${VALIDATOR_7_ADDRESS}"

cat <<EOF
# If you need to fund all these accounts on arlocal, you can run:
for address in ${TOKEN_CONTRACT_OWNER_ADDRESS} ${BUNDLERS_CONTRACT_OWNER_ADDRESS} ${BUNDLER_1_ADDRESS} ${BUNDLER_2_ADDRESS} ${VALIDATOR_1_ADDRESS} ${VALIDATOR_2_ADDRESS} ${VALIDATOR_3_ADDRESS} ${VALIDATOR_4_ADDRESS} ${VALIDATOR_5_ADDRESS} ${VALIDATOR_6_ADDRESS} ${VALIDATOR_7_ADDRESS}
do
    curl -s -nw "\n" "http://localhost:1984/mint/\${address}/10000000000000"
done
EOF
