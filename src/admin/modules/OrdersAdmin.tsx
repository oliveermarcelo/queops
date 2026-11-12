/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, FileCode2, FileText, Loader2, MapPin, Package, Printer,
  Search, Trash2, Wallet,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { cancelarEtiqueta, fetchOrderTracking, gerarEtiqueta, setOrderTracking } from '../store';
import { Order, OrderInvoice, OrderStatus, TrackingEvent } from '../types';
import { brl, fmtDate, Btn, Card, ConfirmDialog, inputCls } from '../ui';

/**
 * Por que este pedido não pode ser apagado — vazio quando pode.
 *
 * A mesma regra do servidor, escrita uma vez e usada tanto para desabilitar o
 * botão quanto para explicar no título dele. Duplicar a condição solta pela
 * tela é como o botão de excluir produto passou a prometer o que a rota
 * recusava.
 */
/** Nome legível do meio de pagamento. */
const MEIO: Record<string, string> = {
  pix: 'Pix',
  card: 'Cartão de crédito',
  boleto: 'Boleto',
};

/** "Rua X, 100 — Centro" a partir do que estiver preenchido. */
function enderecoEmLinhas(e: NonNullable<Order['shippingAddress']>): string[] {
  const rua = [e.street, e.number].filter((x) => String(x ?? '').trim() !== '').join(', ');
  const linha1 = [rua, e.complement].filter((x) => String(x ?? '').trim() !== '').join(' — ');
  const cidade = [e.city, e.state].filter((x) => String(x ?? '').trim() !== '').join('/');
  const linha2 = [e.neighborhood, cidade].filter((x) => String(x ?? '').trim() !== '').join(' — ');
  const cep = String(e.cep ?? '').trim();
  return [linha1, linha2, cep === '' ? '' : `CEP ${cep}`].filter((l) => l !== '');
}

/**
 * Tudo que a lojista precisa saber sobre um pedido, sem abrir o banco.
 *
 * A tela listava sete colunas e parava aí: cliente, canal, data, total,
 * status. Para saber PARA ONDE mandar, ou COMO foi pago, não havia lugar
 * nenhum no painel — e esses dois são justamente o que se olha depois de uma
 * venda. Os dados sempre vieram do servidor (a API do ERP os consome desde o
 * começo); o que faltava era mostrá-los.
 */
function DetalheDoPedido({ o }: { o: Order; key?: React.Key }) {
  const ender = o.shippingAddress;
  const pag = o.paymentDetails;
  const temEndereco = ender !== undefined
    && [ender.street, ender.city, ender.cep].some((x) => String(x ?? '').trim() !== '');

  const Bloco = ({ titulo, icone, children }: {
    titulo: string; icone: React.ReactNode; children: React.ReactNode;
  }) => (
    <div className="bg-white border border-gray-150 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
        {icone} {titulo}
      </div>
      {children}
    </div>
  );

  const Linha = ({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) => (
    <div className="flex justify-between gap-3 text-xs py-0.5">
      <span className="text-gray-500 shrink-0">{rotulo}</span>
      <span className="text-gray-800 text-right break-words">{valor}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 py-2">
      {/* ------------------------------------------------ entrega ---- */}
      <Bloco titulo="Entrega" icone={<MapPin size={13} />}>
        {temEndereco ? (
          <>
            {(ender.recipientName ?? '') !== '' && (
              <p className="text-sm font-semibold text-gray-800 mb-1">{ender.recipientName}</p>
            )}
            {enderecoEmLinhas(ender).map((l) => (
              <p key={l} className="text-xs text-gray-700 leading-relaxed">{l}</p>
            ))}
            {(ender.phone ?? '') !== '' && (
              <p className="text-xs text-gray-500 mt-1">Telefone: {ender.phone}</p>
            )}
          </>
        ) : (
          /*
            Pedido sem endereço existe: retirada combinada, venda pelo
            WhatsApp lançada à mão. Dizer isso é melhor que um bloco em
            branco, que parece defeito.
          */
          <p className="text-xs text-gray-400">
            Sem endereço de entrega neste pedido.
          </p>
        )}
        {(o.shippingService ?? '') !== '' && (
          <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100">
            <b>Frete:</b> {o.shippingService}
          </p>
        )}
        {(o.customerNote ?? '') !== '' && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">
            <b>Recado do cliente:</b> {o.customerNote}
          </p>
        )}
      </Bloco>

      {/* ---------------------------------------------- pagamento ---- */}
      <Bloco titulo="Pagamento" icone={<Wallet size={13} />}>
        <Linha rotulo="Forma" valor={MEIO[pag?.method ?? o.payment] ?? (pag?.method ?? o.payment)} />
        {(pag?.installments ?? 0) > 1 && <Linha rotulo="Parcelas" valor={`${pag?.installments}x`} />}
        {(pag?.brand ?? '') !== '' && pag?.brand != null && <Linha rotulo="Bandeira" valor={pag.brand} />}
        {(pag?.gateway ?? '') !== '' && pag?.gateway != null && <Linha rotulo="Gateway" valor={pag.gateway} />}
        <Linha
          rotulo="Pago em"
          valor={o.paidAt ? fmtDate(o.paidAt) : <span className="text-amber-700">ainda não</span>}
        />
        {(pag?.transactionId ?? '') !== '' && pag?.transactionId != null && (
          <Linha
            rotulo="Transação"
            valor={<code className="font-mono text-[10px]">{pag.transactionId}</code>}
          />
        )}
        {/*
          O motivo da recusa é o campo que responde "por que esta venda não
          aconteceu". Sem ele, a resposta exige abrir o painel do gateway.
        */}
        {(pag?.detail ?? '') !== '' && pag?.detail != null && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mt-2">
            {pag.detail}
          </p>
        )}
        {(o.cancelReason ?? '') !== '' && (
          <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 mt-2">
            <b>Cancelado:</b> {o.cancelReason}
            {(o.canceledBy ?? '') !== '' && ` (${o.canceledBy})`}
          </p>
        )}
      </Bloco>

      {/* ------------------------------------------------- compra ---- */}
      <Bloco titulo="Compra" icone={<Package size={13} />}>
        <div className="space-y-1 mb-2">
          {o.items.map((i, n) => (
            <div key={`${i.productId}-${n}`} className="flex justify-between gap-2 text-xs">
              <span className="text-gray-700">
                {i.quantity}× {i.name}
                {(i.sku ?? '') !== '' && (
                  <span className="text-gray-400 font-mono text-[10px]"> · {i.sku}</span>
                )}
              </span>
              <span className="text-gray-800 whitespace-nowrap">
                {brl(i.totalPrice ?? i.quantity * i.unitPrice)}
              </span>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-gray-100">
          <Linha rotulo="Produtos" valor={brl(o.subtotal)} />
          <Linha rotulo="Frete" valor={brl(o.shipping)} />
          {o.discount > 0 && (
            <Linha
              rotulo={o.couponCode ? `Desconto (${o.couponCode})` : 'Desconto'}
              valor={<span className="text-emerald-700">− {brl(o.discount)}</span>}
            />
          )}
          <div className="flex justify-between gap-3 text-sm font-bold pt-1.5 mt-1 border-t border-gray-100">
            <span>Total</span>
            <span>{brl(o.total)}</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
          <Linha rotulo="E-mail" valor={o.customerEmail} />
          {(o.customerPhone ?? '') !== '' && <Linha rotulo="Telefone" valor={o.customerPhone} />}
          {(o.customerCpf ?? '') !== '' && <Linha rotulo="CPF/CNPJ" valor={o.customerCpf} />}
        </div>
      </Bloco>
    </div>
  );
}

function motivoParaNaoApagar(o: Order): string {
  if (o.paidAt || o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered') {
    return 'Pedido pago não pode ser apagado — é o registro de dinheiro que entrou';
  }
  if (o.hasOpenCharge && o.status !== 'canceled') {
    return 'Tem cobrança em aberto. Marque como cancelado antes de apagar';
  }
  return '';
}

const STATUSES: { id: OrderStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'paid', label: 'Pagos' },
  { id: 'shipped', label: 'Enviados' },
  { id: 'delivered', label: 'Entregues' },
  { id: 'canceled', label: 'Cancelados' },
];

const CHANNEL_LABEL: Record<string, string> = { site: 'Site', whatsapp: 'WhatsApp', erp: 'ERP' };

// Status-colored select (acts as the badge itself, no duplicate label)
const STATUS_SELECT: Record<OrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  canceled: 'bg-gray-100 text-gray-500 border-gray-200',
};

/**
 * Linha de rastreio de um pedido.
 *
 * Some quando o pedido ainda está pendente ou foi cancelado: código de
 * rastreio só faz sentido a partir do momento em que algo é despachado.
 *
 * A consulta aos Correios é sob demanda, no botão — nunca ao abrir a tela.
 * Com muitos pedidos, buscar todos de uma vez seria uma rajada de chamadas à
 * API a cada visita ao painel.
 */
function TrackingRow({
  orderId,
  initialCode,
  lastStatus,
}: {
  orderId: string;
  initialCode: string;
  lastStatus: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [saved, setSaved] = useState(initialCode);
  const [events, setEvents] = useState<TrackingEvent[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<'save' | 'track' | null>(null);

  const salvar = async () => {
    setBusy('save');
    setMsg('');
    try {
      const limpo = code.trim().toUpperCase();
      await setOrderTracking(orderId, limpo);
      setSaved(limpo);
      setCode(limpo);
      setEvents(null);
      setMsg(limpo === '' ? 'Código removido.' : 'Código salvo.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  };

  const rastrear = async () => {
    setBusy('track');
    setMsg('');
    try {
      const r = await fetchOrderTracking(orderId);
      setEvents(r.eventos);
      if (r.erro) setMsg(r.erro);
      else if (r.eventos.length === 0) setMsg('Sem movimentação registrada ainda.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Não foi possível consultar os Correios.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="AA123456789BR"
          className={`${inputCls} w-40 font-mono text-xs uppercase`}
        />
        <button
          onClick={salvar}
          disabled={busy !== null || code.trim().toUpperCase() === saved}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary-blue text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'save' ? 'Salvando…' : 'Salvar'}
        </button>
        {saved !== '' && (
          <button
            onClick={rastrear}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {busy === 'track'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Package className="w-3.5 h-3.5" />}
            Rastrear
          </button>
        )}
      </div>

      {msg !== '' && <p className="text-[11px] text-gray-500">{msg}</p>}

      {/* Último status conhecido, enquanto ninguém pediu a consulta completa. */}
      {events === null && lastStatus !== '' && (
        <p className="text-[11px] text-gray-500">Último status: {lastStatus}</p>
      )}

      {events !== null && events.length > 0 && (
        <ol className="border-l-2 border-gray-100 pl-3 space-y-1.5">
          {events.map((ev, i) => (
            <li key={i} className="text-[11px]">
              <span className={i === 0 ? 'font-bold text-gray-700' : 'text-gray-600'}>
                {ev.descricao}
              </span>
              <span className="text-gray-400">
                {ev.local !== '' && ` · ${ev.local}`}
                {ev.data !== '' && ` · ${fmtDate(ev.data)}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * As notas fiscais do pedido, do jeito que a lojista precisa delas.
 *
 * Quem emite é o ERP; a loja só recebe e guarda. A linha existe porque o
 * pedido que chega pelo WhatsApp ("manda a nota de novo") é atendido daqui,
 * sem abrir o ERP.
 *
 * A nota CANCELADA aparece, riscada e marcada. Sumir com ela seria pior:
 * quando o cliente ligar perguntando da nota que ele recebeu e que não vale
 * mais, a tela precisa explicar o que aconteceu — e não fingir que aquela nota
 * nunca existiu.
 */
function LinhaDeNotas({ notas }: { notas: OrderInvoice[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
        Nota fiscal
      </span>
      {notas.map((n) => {
        const cancelada = n.status === 'canceled';
        return (
          <span key={n.key} className="inline-flex items-center gap-2">
            <span className={`text-xs ${cancelada ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
              Nº {n.number}{n.series ? `/${n.series}` : ''} · R$ {n.totalAmount}
            </span>
            {cancelada && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                cancelada
              </span>
            )}
            <a
              href={n.pdfUrl}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-blue hover:underline"
              title={`Chave ${n.key}`}
            >
              <FileText size={13} /> DANFE
            </a>
            <a
              href={n.xmlUrl}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-primary-blue hover:underline"
            >
              <FileCode2 size={13} /> XML
            </a>
          </span>
        );
      })}
    </div>
  );
}


/**
 * A etiqueta do pedido.
 *
 * Emitir GASTA DINHEIRO — a Envia debita o frete do saldo da conta —, e é por
 * isso que esta parte da tela é tão explícita. O botão só aparece em pedido
 * PAGO, diz com todas as letras que vai cobrar, e some assim que a etiqueta
 * existe: no lugar dele fica o link de reimpressão, porque reimprimir não
 * custa nada e emitir de novo custa o frete inteiro outra vez.
 */
function EtiquetaDoPedido({ o }: { o: Order; key?: React.Key }) {
  const { refresh } = useAdmin();
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const emitida = (o.shipmentRef ?? '') !== '';

  const emitir = async () => {
    setConfirmando(false);
    setErro('');
    setAviso('');
    setRodando(true);
    try {
      const r = await gerarEtiqueta(o.id);
      setAviso(
        `Etiqueta emitida — R$ ${r.price.toFixed(2).replace('.', ',')}`
        + (r.trackingCode !== '' ? ` · rastreio ${r.trackingCode}` : ''),
      );
      await refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível emitir a etiqueta.');
    } finally {
      setRodando(false);
    }
  };

  const cancelar = async () => {
    setErro('');
    setAviso('');
    setRodando(true);
    try {
      await cancelarEtiqueta(o.id);
      await refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível cancelar o envio.');
    } finally {
      setRodando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Etiqueta</span>

      {emitida ? (
        <>
          {(o.labelUrl ?? '') !== '' && (
            <a
              href={o.labelUrl ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-blue hover:underline"
            >
              <Printer size={13} /> Imprimir etiqueta
            </a>
          )}
          <span className="text-[11px] text-gray-400 font-mono">envio {o.shipmentRef}</span>
          <button
            onClick={() => void cancelar()}
            disabled={rodando}
            className="text-[11px] text-gray-400 hover:text-brand-red disabled:opacity-40"
          >
            {rodando ? 'cancelando…' : 'cancelar envio'}
          </button>
        </>
      ) : (
        <Btn variant="ghost" disabled={rodando} onClick={() => setConfirmando(true)}>
          {rodando ? 'Emitindo…' : 'Gerar etiqueta na Envia'}
        </Btn>
      )}

      {erro !== '' && (
        <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          {erro}
        </span>
      )}
      {aviso !== '' && (
        <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          {aviso}
        </span>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Emitir a etiqueta agora?"
          message={
            `A Envia vai cobrar o frete deste pedido do saldo da conta e gerar a etiqueta de `
            + `"${o.customerName}".\n\n`
            + 'Isso acontece uma vez só: emitir de novo para o mesmo pedido pagaria o frete duas '
            + 'vezes, e por isso o botão some depois. Para reimprimir, use o link que fica aqui.'
          }
          confirmLabel="Emitir e cobrar"
          onCancel={() => setConfirmando(false)}
          onConfirm={() => void emitir()}
        />
      )}
    </div>
  );
}

/**
 * Motivos prontos para o cancelamento.
 *
 * São opções, e não um campo livre sozinho, porque o ERP precisa distinguir os
 * casos — e porque texto livre em campo de motivo vira "cancelado" escrito de
 * quinze jeitos diferentes, o que não se agrupa em relatório nenhum. O campo
 * livre continua ali para o que não couber nesta lista.
 */
const MOTIVOS_DE_CANCELAMENTO = [
  'Cliente desistiu da compra',
  'Produto sem estoque',
  'Pagamento não confirmado',
  'Endereço fora da área de entrega',
  'Suspeita de fraude',
  'Pedido duplicado',
];

function DialogoDeCancelamento({ pedido, onFechar, onConfirmar }: {
  pedido: Order;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [escolhido, setEscolhido] = useState(MOTIVOS_DE_CANCELAMENTO[0]);
  const [outro, setOutro] = useState('');
  const usaOutro = escolhido === 'Outro';
  const motivo = usaOutro ? outro.trim() : escolhido;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onFechar} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <h3 id="cancel-title" className="font-extrabold text-gray-900">Cancelar pedido</h3>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          O pedido {pedido.id}, de {pedido.customerName}, será marcado como cancelado.
          {' '}O motivo vai junto para o ERP — lá, “o cliente desistiu” e “o pagamento foi
          recusado” viram lançamentos diferentes.
        </p>

        <div className="mt-4 space-y-2">
          {[...MOTIVOS_DE_CANCELAMENTO, 'Outro'].map((m) => (
            <label key={m} className="flex items-center gap-2.5 text-sm text-gray-700">
              <input
                type="radio"
                name="motivo-cancelamento"
                checked={escolhido === m}
                onChange={() => setEscolhido(m)}
                className="accent-primary-blue w-4 h-4"
              />
              {m}
            </label>
          ))}
        </div>

        {usaOutro && (
          <input
            autoFocus
            value={outro}
            onChange={(e) => setOutro(e.target.value)}
            maxLength={200}
            placeholder="Escreva o motivo"
            className={`${inputCls} mt-3`}
          />
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Btn variant="ghost" onClick={onFechar}>Voltar</Btn>
          {/*
            Sem motivo escrito, o botão fica travado: um cancelamento sem causa
            registrada é exatamente o que o ERP não consegue interpretar.
          */}
          <Btn variant="danger" onClick={() => onConfirmar(motivo)} disabled={motivo === ''}>
            Cancelar pedido
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function OrdersAdmin() {
  const { state, setOrderStatus, deleteOrder } = useAdmin();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [apagando, setApagando] = useState<Order | null>(null);
  /** Pedidos com o detalhe aberto. Vários de uma vez: a lojista compara. */
  const [abertos, setAbertos] = useState<string[]>([]);
  const alternar = (id: string) => setAbertos(
    (a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]),
  );
  const [cancelando, setCancelando] = useState<Order | null>(null);

  const orders = useMemo(() => {
    const q = query.toLowerCase();
    return [...state.orders]
      .filter((o) => (filter === 'all' ? true : o.status === filter))
      .filter((o) => o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [state.orders, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === s.id ? 'bg-primary-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pedido/cliente" className={`${inputCls} pl-9`} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <th className="py-3 px-4 font-semibold">Pedido</th>
                <th className="py-3 px-4 font-semibold">Cliente</th>
                <th className="py-3 px-4 font-semibold">Canal</th>
                <th className="py-3 px-4 font-semibold">Data</th>
                <th className="py-3 px-4 font-semibold text-right">Total</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold w-10" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <React.Fragment key={o.id}>
                <tr
                  className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                  /*
                    A linha inteira abre o detalhe.
                    Um botãozinho numa ponta é fácil de não achar — e o que a
                    lojista quer, depois de uma venda, é justamente abrir o
                    pedido. O clique no seletor de status e no botão de apagar
                    não propaga (ver os onClick deles).
                  */
                  onClick={() => alternar(o.id)}
                >
                  <td className="py-2.5 px-4 font-mono text-xs font-bold text-gray-700">
                    <span className="inline-flex items-center gap-1.5">
                      {abertos.includes(o.id)
                        ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                        : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                      {o.id}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <p className="text-gray-700">{o.customerName}</p>
                    <p className="text-[11px] text-gray-400">
                      {o.items.length} item(ns)
                      {(o.shippingAddress?.city ?? '') !== '' && (
                        <> · {o.shippingAddress?.city}/{o.shippingAddress?.state}</>
                      )}
                    </p>
                  </td>
                  <td className="py-2.5 px-4 text-gray-500 text-xs">{CHANNEL_LABEL[o.channel]}</td>
                  <td className="py-2.5 px-4 text-gray-500 text-xs">{fmtDate(o.createdAt)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold">{brl(o.total)}</td>
                  <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={o.status}
                      /*
                        Cancelar abre o diálogo do motivo em vez de aplicar
                        direto. Qualquer outro status segue como antes — só o
                        cancelamento precisa de explicação, porque é o único
                        que o ERP não consegue interpretar sozinho.
                      */
                      onChange={(e) => {
                        const novo = e.target.value as OrderStatus;
                        if (novo === 'canceled') setCancelando(o);
                        else void setOrderStatus(o.id, novo);
                      }}
                      className={`text-xs font-bold rounded-full py-1.5 pl-3 pr-7 border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-blue/20 appearance-none bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat ${STATUS_SELECT[o.status]}`}
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                    >
                      <option value="pending">Pendente</option>
                      <option value="paid">Pago</option>
                      <option value="shipped">Enviado</option>
                      <option value="delivered">Entregue</option>
                      <option value="canceled">Cancelado</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    {/*
                      O botão fica sempre visível, mesmo quando não dá para
                      apagar: desabilitado com o motivo no título ensina a
                      regra; sumir só faz procurar um botão que não existe.
                    */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setApagando(o); }}
                      disabled={motivoParaNaoApagar(o) !== ''}
                      title={motivoParaNaoApagar(o) || 'Apagar pedido'}
                      className="p-2 rounded-lg text-gray-400 enabled:hover:text-brand-red enabled:hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
                {abertos.includes(o.id) && (
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <td colSpan={7} className="px-4">
                      <DetalheDoPedido o={o} />
                    </td>
                  </tr>
                )}
                {/* Rastreio: só a partir do pago — antes disso não há o que despachar. */}
                {(o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered') && (
                  <tr className="border-b border-gray-50 bg-gray-50/30">
                    <td colSpan={7} className="py-2 px-4">
                      <TrackingRow
                        orderId={o.id}
                        initialCode={o.trackingCode ?? ''}
                        lastStatus={o.trackingStatus ?? ''}
                      />
                    </td>
                  </tr>
                )}
                {/*
                  Etiqueta: só a partir do PAGO, como o rastreio. Antes do
                  dinheiro entrar, emitir é pagar frete de uma venda que pode
                  não se confirmar.
                */}
                {o.paidAt && o.status !== 'canceled' && (
                  <tr className="border-b border-gray-50 bg-gray-50/30">
                    <td colSpan={7} className="py-2 px-4">
                      <EtiquetaDoPedido o={o} />
                    </td>
                  </tr>
                )}
                {(o.invoices ?? []).length > 0 && (
                  <tr className="border-b border-gray-50 bg-gray-50/30">
                    <td colSpan={7} className="py-2 px-4">
                      <LinhaDeNotas notas={o.invoices ?? []} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">Nenhum pedido neste filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {cancelando && (
        <DialogoDeCancelamento
          pedido={cancelando}
          onFechar={() => setCancelando(null)}
          onConfirmar={(motivo) => {
            void setOrderStatus(cancelando.id, 'canceled', motivo);
            setCancelando(null);
          }}
        />
      )}

      {apagando && (
        <ConfirmDialog
          title="Apagar pedido"
          message={
            `O pedido ${apagando.id}, de ${apagando.customerName}, será apagado do banco com os `
            + 'itens dele, e não volta.\n\n'
            + 'Nenhum pagamento foi confirmado nele, então não se perde registro de dinheiro. '
            + 'Se o produto desse pedido estava travado para exclusão, ele libera.'
          }
          confirmLabel="Apagar pedido"
          onCancel={() => setApagando(null)}
          onConfirm={() => {
            void deleteOrder(apagando.id);
            setApagando(null);
          }}
        />
      )}
    </div>
  );
}
