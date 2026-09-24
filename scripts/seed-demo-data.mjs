import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

// Cidades do Paraguai
const CIUDADES_PARAGUAY = [
  "Asunción", "Ciudad del Este", "Encarnación", "Villarrica", "Concepción",
  "Caaguazú", "Coronel Oviedo", "Salto del Guairá", "Pedro Juan Caballero",
  "San Juan Bautista", "Iguazú", "Filadelfia", "Caazapá", "Paraguarí"
];

// Marcas de auto peças
const MARCAS = [
  "Bosch", "Denso", "ZF", "Continental", "Valeo", "SKF", "Sachs",
  "Autolite", "Gates", "Dayco", "LUK", "NSK", "ESCO", "Brembo"
];

// Categorias de auto peças
const CATEGORIAS = [
  "Motor y Accesorios", "Sistema de Frenos", "Suspensión",
  "Sistema Eléctrico", "Transmisión", "Dirección", "Climatización",
  "Iluminación", "Filtros", "Correas y Cadenas"
];

// Gerar nome de produto de auto peça
function gerarNomeProduto(marca, categoria, numero) {
  const tipos = {
    "Motor y Accesorios": ["Válvula", "Arandela", "Junta", "Pistón", "Cilindro"],
    "Sistema de Frenos": ["Pastilla", "Disco", "Cilindro", "Bomba", "Manguera"],
    "Suspensión": ["Amortiguador", "Resorte", "Bujía", "Goma", "Barra"],
    "Sistema Eléctrico": ["Alternador", "Motor", "Batería", "Bobina", "Sensor"],
    "Transmisión": ["Embrague", "Sincronizador", "Piñón", "Anillo", "Aceite"],
    "Dirección": ["Rótula", "Terminal", "Cremallera", "Piñón", "Manguera"],
    "Climatización": ["Compresor", "Evaporador", "Condensador", "Filtro", "Válvula"],
    "Iluminación": ["Faro", "Bombilla", "Reflector", "Lente", "Soporte"],
    "Filtros": ["Aire", "Aceite", "Combustible", "Cabina", "Agua"],
    "Correas y Cadenas": ["Correa", "Cadena", "Tensor", "Polea", "Engrane"]
  };

  const tipo = tipos[categoria]?.[numero % tipos[categoria].length] || "Componente";
  return `${marca} ${tipo} ${categoria} COD-${numero}`;
}

// Gerar data aleatória nos últimos 3 anos
function gerarDataAleatoria() {
  const agora = new Date();
  const tres_anos_atras = new Date(agora.getFullYear() - 3, agora.getMonth(), agora.getDate());
  const timestamp = tres_anos_atras.getTime() + Math.random() * (agora.getTime() - tres_anos_atras.getTime());
  const data = new Date(timestamp);
  return data.toISOString().split('T')[0];
}

// Função para adicionar dias a uma data
function adicionarDias(data, dias) {
  const nova_data = new Date(data);
  nova_data.setDate(nova_data.getDate() + dias);
  return nova_data.toISOString().split('T')[0];
}

// Gerador de dados
async function seedDemoData() {
  try {
    console.log("🌱 Iniciando seed de dados de demonstração...\n");

    // ID da empresa (matriz)
    const EMPRESA_ID = "80083188";

    // Gerar vendedores
    console.log("👥 Criando vendedores...");
    const vendedores = [
      { id: "V001", name: "Juan García" },
      { id: "V002", name: "María López" },
      { id: "V003", name: "Carlos Rodríguez" },
      { id: "V004", name: "Ana Martínez" },
      { id: "V005", name: "Pedro González" }
    ];

    // Gerar clientes
    console.log("👨‍💼 Criando clientes (100+)...");
    const clientes = [];
    for (let i = 1; i <= 120; i++) {
      const ciudad = CIUDADES_PARAGUAY[i % CIUDADES_PARAGUAY.length];
      clientes.push({
        id: `CLI-${String(i).padStart(4, '0')}`,
        name: `Cliente ${i} - ${ciudad}`,
        city: ciudad
      });
    }

    // Gerar produtos
    console.log("📦 Criando produtos (2000+)...");
    const produtos = [];
    let produto_numero = 1;
    for (const marca of MARCAS) {
      for (const categoria of CATEGORIAS) {
        for (let i = 0; i < 16; i++) {
          produtos.push({
            id: `PROD-${String(produto_numero).padStart(5, '0')}`,
            name: gerarNomeProduto(marca, categoria, produto_numero),
            subgroup: categoria,
            preco: Math.floor(Math.random() * 5000000) + 100000 // G$ 100k a 5.1M
          });
          produto_numero++;
        }
      }
    }

    // Gerar vendas (distribuir ao longo de 3 anos)
    console.log("💰 Criando vendas com 3 anos de histórico...");
    const vendas = [];
    const data_inicio = new Date();
    data_inicio.setFullYear(data_inicio.getFullYear() - 3);

    // 5 vendas por dia em média = ~1825 vendas em 3 anos
    // Vamos fazer umas 2000 vendas distribuídas aleatoriamente
    for (let i = 0; i < 2000; i++) {
      const dias_offset = Math.floor(Math.random() * 1095); // 3 anos = ~1095 dias
      const data_venda = new Date(data_inicio);
      data_venda.setDate(data_venda.getDate() + dias_offset);
      const data_str = data_venda.toISOString().split('T')[0];

      const vendedor = vendedores[Math.floor(Math.random() * vendedores.length)];
      const cliente = clientes[Math.floor(Math.random() * clientes.length)];
      const produto = produtos[Math.floor(Math.random() * produtos.length)];

      const quantidade = Math.floor(Math.random() * 100) + 1;
      const valor_unitario = produto.preco;
      const desconto = Math.random() > 0.7 ? Math.floor((valor_unitario * quantidade) * 0.05) : 0; // 5% desc em 30% vendas
      const total = (valor_unitario * quantidade) - desconto;

      vendas.push({
        date: data_str,
        orderId: `PED-${String(i + 1).padStart(6, '0')}`,
        orderType: "VENDA",
        channel: Math.random() > 0.5 ? "MOSTRADOR" : "ENTREGA",
        clientId: cliente.id,
        clientName: cliente.name,
        clientCity: cliente.city,
        productId: produto.id,
        productName: produto.name,
        quantity: quantidade,
        totalOrig: total,
        costOrig: total * 0.4, // Custo é ~40% do preço
        discountOrig: desconto,
        subgroupId: produto.subgroup,
        subgroupName: produto.subgroup,
        sellerId: vendedor.id,
        sellerName: vendedor.name,
        currencyId: "1",
        currencyCode: "G$",
        empresaId: EMPRESA_ID
      });
    }

    // Gerar contas a receber
    console.log("📋 Criando contas a receber...");
    const receber = [];
    for (let i = 0; i < 500; i++) {
      const dias_offset = Math.floor(Math.random() * 1095);
      const data_emissao = new Date(data_inicio);
      data_emissao.setDate(data_emissao.getDate() + dias_offset);
      const data_str = data_emissao.toISOString().split('T')[0];

      const cliente = clientes[Math.floor(Math.random() * clientes.length)];
      const valor = Math.floor(Math.random() * 50000000) + 100000; // G$ 100k a 50M
      const dias_vencimento = [15, 30, 45, 60, 90][Math.floor(Math.random() * 5)];

      const data_venc = new Date(data_emissao);
      data_venc.setDate(data_venc.getDate() + dias_vencimento);
      const data_venc_str = data_venc.toISOString().split('T')[0];

      const is_paid = Math.random() > 0.3; // 70% pago
      const data_recebimento = is_paid ? adicionarDias(data_str, Math.floor(Math.random() * dias_vencimento)) : "";

      receber.push({
        documentId: `NF-${String(i + 1).padStart(6, '0')}`,
        clientId: cliente.id,
        clientName: cliente.name,
        clientCity: cliente.city,
        issueDate: data_str,
        dueDate: data_venc_str,
        receivedDate: data_recebimento,
        isPaid: is_paid,
        entryType: "VENTA",
        amountOrig: valor,
        sellerId: vendedores[Math.floor(Math.random() * vendedores.length)].id,
        sellerName: vendedores[Math.floor(Math.random() * vendedores.length)].name,
        currencyId: "1",
        currencyCode: "G$",
        empresaId: EMPRESA_ID
      });
    }

    // Gerar contas a pagar
    console.log("💳 Criando contas a pagar...");
    const pagar = [];
    const fornecedores = [
      { id: "FOR001", name: "Distribuidora Central" },
      { id: "FOR002", name: "Importadora del Mercosur" },
      { id: "FOR003", name: "Proveedor Mayorista" },
      { id: "FOR004", name: "Supplier Internacional" },
      { id: "FOR005", name: "Distribuidor Regional" }
    ];

    for (let i = 0; i < 400; i++) {
      const dias_offset = Math.floor(Math.random() * 1095);
      const data_emissao = new Date(data_inicio);
      data_emissao.setDate(data_emissao.getDate() + dias_offset);
      const data_str = data_emissao.toISOString().split('T')[0];

      const fornecedor = fornecedores[Math.floor(Math.random() * fornecedores.length)];
      const valor = Math.floor(Math.random() * 100000000) + 500000; // G$ 500k a 100M
      const dias_vencimento = [30, 60, 90][Math.floor(Math.random() * 3)];

      const data_venc = new Date(data_emissao);
      data_venc.setDate(data_venc.getDate() + dias_vencimento);
      const data_venc_str = data_venc.toISOString().split('T')[0];

      const is_paid = Math.random() > 0.25; // 75% pago
      const data_pagamento = is_paid ? adicionarDias(data_str, Math.floor(Math.random() * dias_vencimento)) : "";

      pagar.push({
        documentId: `OC-${String(i + 1).padStart(6, '0')}`,
        supplierId: fornecedor.id,
        supplierName: fornecedor.name,
        issueDate: data_str,
        dueDate: data_venc_str,
        paidDate: data_pagamento,
        isPaid: is_paid,
        entryType: "COMPRA",
        amountOrig: valor,
        currencyId: "1",
        currencyCode: "G$",
        empresaId: EMPRESA_ID
      });
    }

    // Gerar estoque
    console.log("📊 Criando itens de estoque...");
    const estoque = [];
    for (const produto of produtos.slice(0, 1500)) { // Apenas 1500 dos 2000+ em estoque
      estoque.push({
        productId: produto.id,
        description: produto.name,
        manufacturerCode: `MFG-${produto.id}`,
        stock: Math.floor(Math.random() * 500) + 10,
        costTotalUSD: (produto.preco / 5500) * (Math.random() * 0.5 + 0.75), // Aproximado em USD
        minStock: Math.floor(Math.random() * 50) + 5,
        currencyId: "1",
        currencyCode: "G$",
        empresaId: EMPRESA_ID
      });
    }

    // Inserir dados no banco
    console.log("\n📤 Inserindo dados no banco de dados...\n");

    // Inserir vendas
    console.log(`  Inserindo ${vendas.length} vendas...`);
    for (const venda of vendas) {
      await prisma.saleItem.create({ data: venda });
    }

    // Inserir contas a receber
    console.log(`  Inserindo ${receber.length} contas a receber...`);
    for (const item of receber) {
      await prisma.receivableItem.create({ data: item });
    }

    // Inserir contas a pagar
    console.log(`  Inserindo ${pagar.length} contas a pagar...`);
    for (const item of pagar) {
      await prisma.payableItem.create({ data: item });
    }

    // Inserir estoque
    console.log(`  Inserindo ${estoque.length} itens de estoque...`);
    for (const item of estoque) {
      await prisma.inventoryItem.create({ data: item });
    }

    console.log("\n✅ Seed de dados concluído com sucesso!");
    console.log(`\n📊 Resumo dos dados criados:`);
    console.log(`   • Vendas: ${vendas.length}`);
    console.log(`   • Contas a Receber: ${receber.length}`);
    console.log(`   • Contas a Pagar: ${pagar.length}`);
    console.log(`   • Itens de Estoque: ${estoque.length}`);
    console.log(`   • Produtos: ${produtos.length}`);
    console.log(`   • Clientes: ${clientes.length}`);
    console.log(`   • Vendedores: ${vendedores.length}`);
    console.log(`   • Período: ${3} anos`);
    console.log(`   • Moeda: G$ (Guaraní Paraguayo)`);
    console.log(`   • Empresa: ${EMPRESA_ID} (Matriz)\n`);

  } catch (error) {
    console.error("❌ Erro ao fazer seed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDemoData();
