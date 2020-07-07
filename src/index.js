require('dotenv/config')
const path = require('path')
const os = require('os')

const { Indexer, CellCollector } = require('@ckb-lumos/indexer')
const CKB = require('@nervosnetwork/ckb-sdk-core').default

const LUMOS_DB = path.join(os.tmpdir(), 'lumos_db')
const CKB_URL = process.env.CKB_URL || 'http://127.0.0.1:8114'

const ckb = new CKB(CKB_URL)
const indexer = new Indexer(CKB_URL, LUMOS_DB)

const PRI_KEY = process.env.PRI_KEY || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' // private key for demo, don't expose it in production
const PUB_KEY = ckb.utils.privateKeyToPublicKey(PRI_KEY)
const ARGS = '0x' + ckb.utils.blake160(PUB_KEY, 'hex')
const ADDRESS = ckb.utils.pubkeyToAddress(PUB_KEY)

/**
 * start the lumos to sync cells
 */
const startSync = () => {
  indexer.startForever()
}

/**
 * stop the lumos sync
 */
const stopSync = () => {
  indexer.stop()
}

/**
 * collect cells with code hash, hash type and args
 */
const collectCells = async ({ codeHash, hashType, args }) => {
  const collector = new CellCollector(indexer, {
    lock: {
      code_hash: codeHash,
      hash_type: hashType,
      args,
    },
  })

  const cells = []
  const EMPTY_DATA_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

  for await (const cell of collector.collect()) {
    cells.push({
      dataHash: cell.data === '0x' ? EMPTY_DATA_HASH : 'cell.data',
      type: cell.cell_output.type || null,
      capacity: cell.cell_output.capacity,
      outPoint: { txHash: cell.out_point.tx_hash, index: cell.out_point.index },
    })
  }

  return cells
}

/**
 * generate and send a transaction
 */
const bootstrap = async () => {
  startSync()
  const secp256k1Dep = await ckb.loadSecp256k1Dep()
  const cells = await collectCells({ ...secp256k1Dep, args: ARGS })
  stopSync()

  const rawTx = ckb.generateRawTransaction({
    fromAddress: ADDRESS,
    toAddress: ADDRESS,
    capacity: 10000000000000n,
    fee: 100000n,
    safeMode: true,
    cells,
    deps: secp256k1Dep,
  })

  rawTx.witnesses = rawTx.inputs.map((_, i) => (i > 0 ? '0x' : { lock: '', inputType: '', outputType: '' }))
  const signedTx = ckb.signTransaction(PRI_KEY)(rawTx)
  const txHash = await ckb.rpc.sendTransaction(signedTx)
  console.info(`Transaction has been sent with tx hash ${txHash}`)
  return txHash
}

bootstrap()
