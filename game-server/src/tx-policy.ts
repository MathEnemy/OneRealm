import { Transaction } from '@onelabs/sui/transactions';
import { fromBase64, normalizeSuiAddress, normalizeSuiObjectId } from '@onelabs/sui/utils';
import { PACKAGE_ID, SPONSOR_ADDRESS } from './sui-client';

const ALLOWED_TARGETS = new Set([
  `${normalizeSuiObjectId(PACKAGE_ID)}::hero::mint_to_sender`,
  `${normalizeSuiObjectId(PACKAGE_ID)}::hero::equip`,
  `${normalizeSuiObjectId(PACKAGE_ID)}::hero::unequip_to_sender`,
  `${normalizeSuiObjectId(PACKAGE_ID)}::equipment::salvage_to_sender`,
  `${normalizeSuiObjectId(PACKAGE_ID)}::blacksmith::craft_to_sender`,
  `${normalizeSuiObjectId(PACKAGE_ID)}::mission::settle_and_distribute`,
]);

export function verifySponsoredTransaction(txBytes: string, expectedSender: string) {
  const serialized = Buffer.from(txBytes, 'base64');
  if (serialized.length > 2048) {
    throw { status: 400, error: 'Transaction payload too large' };
  }

  if (typeof txBytes !== 'string') {
    throw { status: 400, error: 'Transaction payload must be a string' };
  }

  let txData;
  try {
    txData = fromBase64(txBytes);
  } catch {
    throw { status: 400, error: 'Transaction payload must be valid base64' };
  }
  const tx = Transaction.from(txData);
  const data = tx.getData();

  if (normalizeSuiAddress(data.sender ?? '') !== normalizeSuiAddress(expectedSender)) {
    throw { status: 401, error: 'Sender mismatch' };
  }

  if (normalizeSuiAddress(data.gasData.owner ?? '') !== normalizeSuiAddress(SPONSOR_ADDRESS)) {
    throw { status: 401, error: 'Gas owner mismatch' };
  }

  if (data.commands.length !== 1) {
    throw { status: 401, error: 'Only single-command sponsored transactions are allowed' };
  }

  const [command] = data.commands;
  if (!('MoveCall' in command)) {
    throw { status: 401, error: 'Only MoveCall transactions are allowed' };
  }

  const moveCall = command.MoveCall;
  if (!moveCall) {
    throw { status: 401, error: 'Malformed MoveCall command' };
  }

  const target = `${normalizeSuiObjectId(moveCall.package)}::${moveCall.module}::${moveCall.function}`;
  if (!ALLOWED_TARGETS.has(target)) {
    throw { status: 401, error: 'MoveCall target is not allowlisted' };
  }

  if (target.endsWith('::hero::mint_to_sender')) {
    const nameArg = moveCall.arguments?.[0] as any;
    const index = nameArg?.Input ?? nameArg?.index;
    if (index !== undefined) {
      const input = data.inputs[index] as any;
      const val = input?.value ?? input?.Pure?.bytes;
      if (Array.isArray(val) && val.length > 32) {
        throw { status: 401, error: 'Name argument too long' };
      }
      if (typeof val === 'string' && val.length > 64) {
        throw { status: 401, error: 'Name argument too long' };
      }
    }
  }
}
