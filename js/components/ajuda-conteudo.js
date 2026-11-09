// =====================================================================
// AJUDA — respostas passo a passo (texto fixo, funciona sem internet)
// Cada resposta: id, assunto, titulo, chaves (outras formas de perguntar),
// passos (lista numerada), dica (opcional), link [rota, rótulo do botão].
// Para corrigir um texto, é só editar aqui.
// =====================================================================

export const ASSUNTOS = [
  ['rebanho', 'Rebanho', 'tag'],
  ['reproducao', 'Reprodução e cria', 'heart'],
  ['sanidade', 'Sanidade', 'syringe'],
  ['pesagens', 'Pesagens', 'scale'],
  ['pastos', 'Pastos, compras e vendas', 'map'],
  ['pendencias', 'Painel e pendências', 'bell-ring'],
  ['celular', 'Celular e sem internet', 'smartphone'],
  ['equipe', 'Equipe e acesso', 'users'],
  ['gestao', 'Financeiro, relatórios e configurações', 'wallet'],
];

export const ARTIGOS = [
  // ---------------- Rebanho ----------------
  {
    id: 'cadastrar-animal', assunto: 'rebanho', titulo: 'Como cadastrar um animal novo',
    chaves: 'cadastrar incluir adicionar colocar lançar novo animal boi vaca bezerro novilha garrote brinco',
    passos: [
      'No menu, toque em <b>Rebanho</b> e depois em <b>Cadastrar animal</b>. No celular, também dá pelo botão verde <b>+</b> › <b>Cadastrar animal</b>.',
      'Em <b>Identificação</b>, preencha o número do brinco (obrigatório), o sexo e a data de nascimento.',
      'Em <b>Características e localização</b>, escolha a raça, a categoria e o pasto ou lote onde o animal está.',
      'Em <b>Origem e genealogia</b>, informe se nasceu na fazenda ou foi comprado e, se souber, a mãe e o pai.',
      'Toque em <b>Salvar</b>.',
    ],
    dica: 'Bezerro que nasceu na fazenda? Use "Registrar nascimento": ele já cadastra o bezerro ligado à mãe.',
    link: ['animais/novo', 'Cadastrar animal'],
  },
  {
    id: 'buscar-animal', assunto: 'rebanho', titulo: 'Como achar um animal pelo brinco ou apelido',
    chaves: 'achar encontrar procurar buscar pesquisar localizar animal brinco numero apelido nome ficha',
    passos: [
      'No <b>Painel</b>, use a barra <b>Buscar animal</b> logo abaixo da faixa de boas-vindas.',
      'Digite o número do brinco ou o apelido (não precisa de acento).',
      'Toque no animal na lista de sugestões para abrir a ficha dele.',
      'Se aparecerem vários, toque em <b>Ver todos</b> para ver a lista completa no Rebanho.',
    ],
    link: ['painel', 'Ir para o Painel'],
  },
  {
    id: 'filtrar-rebanho', assunto: 'rebanho', titulo: 'Como filtrar o rebanho (por categoria, pasto, sexo…)',
    chaves: 'filtrar filtro separar mostrar so somente apenas categoria pasto lote sexo machos femeas raca lista',
    passos: [
      'No menu, toque em <b>Rebanho</b>.',
      'Toque em <b>Mais filtros</b> e escolha o que quer ver (categoria, pasto, lote, sexo, raça, situação…).',
      'A lista se atualiza na hora. Os filtros em uso aparecem em <b>Filtros ativos</b>.',
      'Para voltar a ver todos, toque em <b>Limpar filtros</b>.',
    ],
    dica: 'Os quadros do Painel (ex.: Novilhas) também abrem o Rebanho já filtrado.',
    link: ['animais', 'Ir para o Rebanho'],
  },
  {
    id: 'editar-animal', assunto: 'rebanho', titulo: 'Como corrigir os dados de um animal',
    chaves: 'corrigir editar alterar mudar trocar errado erro dados brinco raca categoria data nascimento status situacao',
    passos: [
      'Encontre o animal (barra de busca do Painel ou lista do Rebanho) e abra a ficha.',
      'Toque em <b>Editar</b>.',
      'Corrija o que estiver errado e toque em <b>Salvar</b>.',
      'Se o problema é a situação do animal (ex.: aparece como vendido, mas não foi), use <b>Corrigir status</b> na ficha.',
    ],
    dica: 'Tudo o que foi alterado fica guardado na aba "Alterações" da ficha.',
    link: ['animais', 'Ir para o Rebanho'],
  },
  {
    id: 'foto-animal', assunto: 'rebanho', titulo: 'Como colocar ou trocar a foto do animal',
    chaves: 'foto fotografia imagem camera tirar foto colocar foto trocar foto ver foto retrato',
    passos: [
      'Abra a ficha do animal.',
      'Sem foto ainda: toque no quadro <b>Adicionar foto</b> (com a câmera) e tire a foto ou escolha uma da galeria.',
      'Já tem foto: toque na foto e escolha <b>Trocar foto</b>.',
      'Para ver a foto grande, toque na foto e escolha <b>Ver foto</b>.',
    ],
    link: ['animais', 'Ir para o Rebanho'],
  },
  {
    id: 'documentos', assunto: 'rebanho', titulo: 'Como guardar um documento do animal (GTA, nota, exame)',
    chaves: 'documento gta nota fiscal exame laudo arquivo pdf anexar anexo guardar registro genealogico',
    passos: [
      'Abra a ficha do animal.',
      'Vá na aba <b>Documentos e fotos</b>.',
      'Toque em <b>Adicionar foto ou documento</b> e escolha o arquivo ou tire a foto do papel.',
    ],
    link: ['animais', 'Ir para o Rebanho'],
  },
  {
    id: 'exportar-rebanho', assunto: 'rebanho', titulo: 'Como baixar a lista do rebanho em Excel ou PDF',
    chaves: 'baixar exportar imprimir planilha excel pdf lista rebanho relacao animais',
    passos: [
      'No menu, toque em <b>Rebanho</b> (se quiser, aplique filtros antes).',
      'Toque em <b>Exportar</b>.',
      'Escolha <b>Planilha Excel</b> ou <b>PDF</b>.',
    ],
    link: ['animais', 'Ir para o Rebanho'],
  },
  {
    id: 'excluir-animal', assunto: 'rebanho', titulo: 'Como apagar um animal cadastrado por engano',
    chaves: 'apagar excluir deletar remover tirar animal engano duplicado errado',
    passos: [
      'Abra a ficha do animal.',
      'Toque em <b>Excluir</b> e confirme.',
    ],
    dica: 'Excluir é só para cadastro errado. Se o animal foi vendido ou morreu, use "Registrar saída" para manter o histórico.',
    link: ['animais', 'Ir para o Rebanho'],
  },

  // ---------------- Reprodução ----------------
  {
    id: 'cobertura', assunto: 'reproducao', titulo: 'Como registrar cobertura ou inseminação',
    chaves: 'cobertura cobrir inseminacao inseminar iatf monta natural touro semen cruzar emprenhar enxertar',
    passos: [
      'Abra a ficha da vaca e toque em <b>Registrar cobertura</b>. Também dá em <b>Reprodução e cria</b> › <b>Cobertura</b>.',
      'Escolha o tipo (monta natural, inseminação, IATF), o touro ou o sêmen e a data.',
      'Toque em <b>Salvar</b>. A previsão de parto é calculada sozinha.',
    ],
    link: ['reproducao', 'Ir para Reprodução'],
  },
  {
    id: 'diagnostico', assunto: 'reproducao', titulo: 'Como registrar o diagnóstico de prenhez (toque ou ultrassom)',
    chaves: 'vaca diagnostico prenhe prenha prenhez gestacao toque ultrassom ultrasom vazia emprenhou confirmar',
    passos: [
      'Abra a ficha da vaca e toque em <b>Diagnóstico</b>. Também dá em <b>Reprodução e cria</b> › <b>Diagnóstico</b>.',
      'Informe a data e o resultado: prenhe ou vazia.',
      'Toque em <b>Salvar</b>.',
    ],
    dica: 'As vacas que já passaram do prazo para o diagnóstico aparecem em Pendências › Diagnósticos de gestação pendentes.',
    link: ['reproducao', 'Ir para Reprodução'],
  },
  {
    id: 'parto', assunto: 'reproducao', titulo: 'Como registrar um nascimento (a vaca pariu)',
    chaves: 'vaca nascimento nasceu parto pariu parir bezerro bezerra cria filhote registrar nascimento',
    passos: [
      'Toque no botão verde <b>+</b> › <b>Registrar nascimento</b>. Também dá pela ficha da vaca (<b>Registrar parto</b>) ou em <b>Reprodução e cria</b> › <b>Nascimento</b>.',
      'Escolha a mãe, a data do parto e o sexo do bezerro.',
      'Informe o brinco do bezerro e, se tiver, o peso ao nascer.',
      'Toque em <b>Salvar</b>. O bezerro já fica cadastrado no rebanho, ligado à mãe.',
    ],
    link: ['reproducao', 'Ir para Reprodução'],
  },
  {
    id: 'parto-sem-registro', assunto: 'reproducao', titulo: 'Vaca aparece em "Partos sem registro". O que fazer?',
    chaves: 'partos sem registro falta data do parto parida pos parto numero de partos zero vaca pendente',
    passos: [
      'Esse aviso aparece quando a vaca está como parida, mas o parto ainda não foi lançado com data.',
      'Em <b>Pendências</b>, toque no quadro <b>Partos sem registro</b> e depois na vaca.',
      'Na ficha, toque em <b>Registrar parto</b>, informe a data e os dados do bezerro e salve.',
      'Pronto: o aviso some e a contagem de partos da vaca é atualizada.',
    ],
    link: ['pendencias', 'Ir para Pendências'],
  },
  {
    id: 'desmame', assunto: 'reproducao', titulo: 'Como registrar o desmame',
    chaves: 'desmame desmamar apartar separar bezerro da mae desmama',
    passos: [
      'Abra a ficha do bezerro e toque em <b>Registrar desmame</b>. Também dá em <b>Reprodução e cria</b> › <b>Desmame</b>.',
      'Informe a data e o peso ao desmame.',
      'Toque em <b>Salvar</b>.',
    ],
    link: ['reproducao', 'Ir para Reprodução'],
  },
  {
    id: 'touro-semen', assunto: 'reproducao', titulo: 'Como cadastrar touro ou sêmen',
    chaves: 'touro reprodutor semen palheta dose botijao cadastrar touro cadastrar semen',
    passos: [
      'Touro da fazenda: cadastre como um animal comum (macho, categoria touro) em <b>Rebanho</b> › <b>Cadastrar animal</b>.',
      'Sêmen: vá em <b>Reprodução e cria</b>, aba <b>Touros e sêmen</b>, e toque em <b>Cadastrar sêmen</b>.',
      'Depois disso, o touro ou o sêmen aparece para escolher na hora de registrar a cobertura.',
    ],
    link: ['reproducao', 'Ir para Reprodução'],
  },

  // ---------------- Sanidade ----------------
  {
    id: 'vacinar', assunto: 'sanidade', titulo: 'Como vacinar ou dar vermífugo',
    chaves: 'vacina vacinar vacinacao vermifugo vermifugar aftosa brucelose raiva aplicacao aplicar dose',
    passos: [
      'Toque no botão verde <b>+</b> › <b>Registrar vacinação</b>. Também dá em <b>Sanidade</b> › <b>Vacinação / aplicação</b>.',
      'Escolha o produto e os animais (um por um ou um lote/pasto inteiro).',
      'Informe a data e a dose. Se tiver reforço, preencha a próxima aplicação para o sistema lembrar.',
      'Toque em <b>Salvar</b>.',
    ],
    link: ['sanidade', 'Ir para Sanidade'],
  },
  {
    id: 'tratamento', assunto: 'sanidade', titulo: 'Como registrar um animal doente ou um tratamento',
    chaves: 'doente doenca tratamento tratar remedio medicamento antibiotico ferida machucado ocorrencia bicheira',
    passos: [
      'Toque no botão verde <b>+</b> › <b>Registrar tratamento</b>. Também dá em <b>Sanidade</b> › <b>Tratamento / ocorrência</b>.',
      'Escolha o animal, o problema e o remédio usado.',
      'Toque em <b>Salvar</b>. O animal fica em "Tratamentos em andamento" até você concluir.',
    ],
    link: ['sanidade', 'Ir para Sanidade'],
  },
  {
    id: 'carencia', assunto: 'sanidade', titulo: 'O que é período de carência (quando posso abater)',
    chaves: 'carencia periodo de carencia abate abater liberado residuo prazo remedio',
    passos: [
      'Carência é o prazo depois de um remédio ou vacina em que o animal não pode ir para o abate.',
      'O sistema calcula sozinho a partir do produto usado.',
      'Veja os animais em carência em <b>Sanidade</b> e em <b>Pendências</b> › <b>Fim de carência</b>.',
    ],
    link: ['sanidade', 'Ir para Sanidade'],
  },
  {
    id: 'produto-estoque', assunto: 'sanidade', titulo: 'Como cadastrar um remédio ou vacina e controlar o estoque',
    chaves: 'cadastrar produto remedio vacina medicamento estoque farmacia comprar frasco',
    passos: [
      'Vá em <b>Sanidade</b>, aba <b>Produtos e estoque</b>.',
      'Toque em <b>Cadastrar produto</b> e preencha nome, tipo e período de carência.',
      'Toque em <b>Salvar</b>. O produto passa a aparecer nos registros de vacinação e tratamento.',
    ],
    link: ['sanidade', 'Ir para Sanidade'],
  },
  {
    id: 'protocolo', assunto: 'sanidade', titulo: 'Como montar o calendário de vacinação (protocolo)',
    chaves: 'calendario protocolo programacao agenda vacinacao rotina anual lembrete',
    passos: [
      'Vá em <b>Sanidade</b>, aba <b>Protocolos</b>.',
      'Toque em <b>Cadastrar protocolo</b> e informe os produtos e as épocas.',
      'As próximas aplicações aparecem em <b>Calendário e pendências</b>.',
    ],
    link: ['sanidade', 'Ir para Sanidade'],
  },

  // ---------------- Pesagens ----------------
  {
    id: 'pesagem-individual', assunto: 'pesagens', titulo: 'Como pesar um animal',
    chaves: 'pesar pesagem peso balanca kg quilos arroba individual um animal',
    passos: [
      'Toque no botão verde <b>+</b> › <b>Registrar pesagem</b> › individual. Também dá pela ficha do animal (<b>Registrar pesagem</b>) ou em <b>Pesagens</b> › <b>Pesagem individual</b>.',
      'Escolha o animal, a data e digite o peso em kg.',
      'Toque em <b>Salvar</b>.',
    ],
    link: ['pesagens', 'Ir para Pesagens'],
  },
  {
    id: 'pesagem-coletiva', assunto: 'pesagens', titulo: 'Como pesar um lote inteiro de uma vez',
    chaves: 'pesagem coletiva pesar lote pasto todos varios muitos animais balanca curral de uma vez',
    passos: [
      'Vá em <b>Pesagens</b> e toque em <b>Pesagem coletiva</b>.',
      'Escolha o grupo: um lote, um pasto, uma categoria ou todos os animais ativos.',
      'Digite o peso de cada animal na lista. Quem não passou na balança pode ficar em branco.',
      'Toque em <b>Salvar</b>.',
    ],
    link: ['pesagens', 'Ir para Pesagens'],
  },
  {
    id: 'ganho-peso', assunto: 'pesagens', titulo: 'Como ver o ganho de peso (GMD)',
    chaves: 'ganho de peso gmd desempenho engorda crescimento ganho diario evolucao grafico',
    passos: [
      'Em <b>Pesagens</b> você vê o desempenho dos lotes e do rebanho.',
      'Para um animal só, abra a ficha e vá na aba <b>Pesagens</b>.',
      'Em <b>Gráficos</b> há também a evolução do rebanho ao longo dos meses.',
    ],
    link: ['pesagens', 'Ir para Pesagens'],
  },

  // ---------------- Pastos, compras e vendas ----------------
  {
    id: 'transferir-pasto', assunto: 'pastos', titulo: 'Como mudar animais de pasto ou de lote',
    chaves: 'transferir mudar trocar mover passar pasto piquete lote rodar rodizio levar',
    passos: [
      'Toque no botão verde <b>+</b> › <b>Transferir de pasto</b>. Também dá em <b>Pastagens e lotes</b> › <b>Transferir animais</b>.',
      'Escolha os animais (ou todo o pasto de origem) e o pasto ou lote de destino.',
      'Confira a data e toque em <b>Salvar</b>.',
    ],
    link: ['pastagens', 'Ir para Pastagens'],
  },
  {
    id: 'cadastrar-pasto', assunto: 'pastos', titulo: 'Como cadastrar um pasto ou um lote',
    chaves: 'cadastrar pasto piquete area lote novo pasto novo lote invernada',
    passos: [
      'Vá em <b>Pastagens e lotes</b>.',
      'Toque em <b>+ Pasto</b> ou <b>+ Lote</b>.',
      'Preencha o nome (e a área, no caso do pasto) e toque em <b>Salvar</b>.',
    ],
    link: ['pastagens', 'Ir para Pastagens'],
  },
  {
    id: 'venda', assunto: 'pastos', titulo: 'Como registrar uma venda',
    chaves: 'vender venda vendi vendido boi bois novilha vaca garrote saida frigorifico leilao comprador',
    passos: [
      'Vá em <b>Movimentações</b> e toque em <b>Registrar venda</b>. Para um animal só, também dá pela ficha (<b>Vender</b>).',
      'Escolha os animais e preencha a data, o comprador, o peso e o valor total.',
      'Toque em <b>Salvar</b>. Os animais saem do rebanho ativo, mas o histórico continua guardado.',
    ],
    link: ['movimentacoes', 'Ir para Movimentações'],
  },
  {
    id: 'morte', assunto: 'pastos', titulo: 'Como registrar a morte de um animal',
    chaves: 'morte morreu morto obito perda baixa saida raio cobra',
    passos: [
      'Toque no botão verde <b>+</b> › <b>Registrar morte</b>. Também dá pela ficha do animal (<b>Registrar saída</b>).',
      'Escolha o animal, a data e, se souber, a causa.',
      'Toque em <b>Salvar</b>.',
    ],
    dica: 'Para outras saídas (doação, consumo, roubo), use Movimentações › Outra saída.',
    link: ['movimentacoes', 'Ir para Movimentações'],
  },
  {
    id: 'compra', assunto: 'pastos', titulo: 'Como registrar uma compra de animais',
    chaves: 'comprar compra comprei entrada chegou animais comprados boi bois novilha novilhas bezerro garrote vaca',
    passos: [
      'Vá em <b>Movimentações</b> e toque em <b>Registrar compra</b>.',
      'Informe a data, o vendedor, a quantidade, o sexo, a raça, o primeiro brinco e o valor.',
      'Toque em <b>Salvar</b>. Os animais entram no rebanho com brincos em sequência.',
    ],
    link: ['movimentacoes', 'Ir para Movimentações'],
  },
  {
    id: 'suplementacao', assunto: 'pastos', titulo: 'Como registrar sal, ração ou suplemento',
    chaves: 'sal mineral racao suplemento suplementacao trato cocho alimentacao fornecer fornecimento proteinado',
    passos: [
      'Toque no botão verde <b>+</b> › <b>Registrar suplementação</b>. Também dá em <b>Alimentação</b> › <b>Registrar fornecimento</b>.',
      'Escolha o produto, o pasto ou lote e a quantidade.',
      'Toque em <b>Salvar</b>. O estoque do produto é descontado.',
    ],
    link: ['alimentacao', 'Ir para Alimentação'],
  },

  // ---------------- Painel e pendências ----------------
  {
    id: 'pendencias', assunto: 'pendencias', titulo: 'O que significa cada quadro de Pendências',
    chaves: 'pendencias pendencia aviso alerta atrasado vermelho quadro atencao lembrete significa',
    passos: [
      '<b>Vacinas próximas</b> e <b>Vermifugações pendentes</b>: aplicações que vencem nos próximos dias.',
      '<b>Previsões de parto</b>: vacas prenhes perto da data de parir.',
      '<b>Partos sem registro</b>: vacas paridas sem a data do parto lançada.',
      '<b>Diagnósticos de gestação pendentes</b>: vacas cobertas que já podem fazer o toque.',
      '<b>Desmames previstos</b>: bezerros chegando na idade de desmama.',
      '<b>Tratamentos em andamento</b>, <b>Fim de carência</b> e <b>Suplementos com estoque baixo</b>: o nome já diz.',
      'Quadro em vermelho = tem algo atrasado. Toque no quadro para ver a lista e no animal para abrir a ficha.',
    ],
    link: ['pendencias', 'Ir para Pendências'],
  },
  {
    id: 'painel', assunto: 'pendencias', titulo: 'Como usar o Painel',
    chaves: 'painel inicio tela inicial resumo quadros numeros composicao mercado cotacao arroba boi',
    passos: [
      'No alto ficam o total de animais ativos e os quadros por categoria. Toque num quadro para ver esses animais.',
      'O gráfico de <b>Composição</b> mostra o rebanho por raça ou categoria (troque nas abas).',
      'O quadro de <b>Mercado</b> mostra o fechamento do boi, vaca, bezerro e novilha em SP.',
      'Embaixo ficam as pendências mais importantes.',
    ],
    link: ['painel', 'Ir para o Painel'],
  },

  // ---------------- Celular e sem internet ----------------
  {
    id: 'instalar', assunto: 'celular', titulo: 'Como instalar o sistema no celular',
    chaves: 'instalar celular telefone aplicativo app icone tela inicial android iphone baixar',
    passos: [
      'Abra o site <b>rebanhopucci.com</b> no celular e entre com seu e-mail e senha.',
      'Android (Chrome): toque em <b>Instalar</b> no aviso do Painel ou no menu <b>⋮</b> › <b>Instalar aplicativo</b>.',
      'iPhone (Safari): toque em <b>Compartilhar</b> (quadrado com seta) › <b>Adicionar à Tela de Início</b>.',
      'Pronto: o ícone da cabeça de vaca aparece na tela do celular.',
    ],
  },
  {
    id: 'sem-internet', assunto: 'celular', titulo: 'Dá para usar sem internet (no curral, no pasto)?',
    chaves: 'sem internet offline sem sinal sem conexao curral pasto sincronizar sincronizacao nao sincronizado wifi',
    passos: [
      'Sim, para lançar coisas novas (pesagens, vacinas, nascimentos…). Abra o sistema pelo menos uma vez com internet antes.',
      'Sem sinal, o que você salvar fica guardado no próprio celular. O aviso no alto mostra quantos registros estão "não sincronizados".',
      'Quando o sinal voltar, o sistema envia tudo sozinho. Nada é duplicado.',
      'Corrigir ou apagar registros precisa de internet.',
    ],
    dica: 'Não saia da conta nem limpe os dados do navegador enquanto houver registros não sincronizados.',
  },
  {
    id: 'atalhos', assunto: 'celular', titulo: 'Para que serve o botão verde + no celular',
    chaves: 'botao mais verde atalhos atalho rapido canto rapido celular',
    passos: [
      'O botão verde <b>+</b> fica no canto de baixo da tela do celular.',
      'Ele abre os atalhos: cadastrar animal, nascimento, pesagem, vacinação, tratamento, transferir de pasto, suplementação e morte.',
      'No computador, os mesmos atalhos ficam no Painel.',
    ],
  },

  // ---------------- Equipe ----------------
  {
    id: 'convidar', assunto: 'equipe', titulo: 'Como dar acesso a um funcionário',
    chaves: 'convidar convite funcionario vaqueiro gerente socio acesso liberar entrar usuario cadastrar pessoa',
    passos: [
      'Vá em <b>Equipe e permissões</b> e toque em <b>Convidar pessoa</b>.',
      'Digite o e-mail da pessoa e escolha o nível de acesso.',
      'Toque em <b>Salvar convite</b> e depois em <b>Copiar mensagem</b> para mandar pelo WhatsApp.',
      'A pessoa cria a conta em rebanhopucci.com com o mesmo e-mail e já entra liberada.',
    ],
    dica: 'Só a proprietária vê a tela Equipe e permissões.',
    link: ['equipe', 'Ir para Equipe'],
  },
  {
    id: 'niveis', assunto: 'equipe', titulo: 'O que cada nível de acesso pode fazer',
    chaves: 'nivel niveis permissao permissoes pode fazer gerente funcionario de campo consulta proprietario',
    passos: [
      '<b>Gerente</b>: quase tudo, inclusive financeiro e relatórios. Não mexe em configurações nem na equipe.',
      '<b>Funcionário de campo</b>: animais, pesagens, reprodução, sanidade, movimentações e suplementação. Sem financeiro nem compra e venda.',
      '<b>Somente consulta</b>: só vê o rebanho e as pendências.',
      'A tabela completa está em <b>Equipe e permissões</b> › <b>O que cada nível pode fazer</b>.',
    ],
    link: ['equipe', 'Ir para Equipe'],
  },
  {
    id: 'tirar-acesso', assunto: 'equipe', titulo: 'Como tirar o acesso de alguém',
    chaves: 'tirar acesso bloquear desativar remover funcionario saiu demitido',
    passos: [
      'Vá em <b>Equipe e permissões</b>.',
      'Na pessoa, toque em <b>Desativar acesso</b> e confirme.',
      'Se precisar, depois é só tocar em <b>Reativar acesso</b>.',
    ],
    link: ['equipe', 'Ir para Equipe'],
  },
  {
    id: 'senha', assunto: 'equipe', titulo: 'Esqueci minha senha',
    chaves: 'esqueci senha trocar senha recuperar senha nao consigo entrar login',
    passos: [
      'Na tela de entrada, toque em <b>Esqueci minha senha</b>.',
      'Digite seu e-mail e confirme.',
      'Abra o e-mail que chegar e crie uma senha nova pelo link.',
    ],
  },

  // ---------------- Financeiro, relatórios e configurações ----------------
  {
    id: 'financeiro', assunto: 'gestao', titulo: 'Como lançar uma despesa ou receita',
    chaves: 'financeiro despesa gasto conta pagar receita entrada dinheiro custo lancar',
    passos: [
      'Vá em <b>Financeiro</b>.',
      'Toque em <b>Nova despesa</b> ou <b>Nova receita</b>.',
      'Preencha data, categoria, descrição e valor, e toque em <b>Salvar</b>.',
    ],
    link: ['financeiro', 'Ir para o Financeiro'],
  },
  {
    id: 'relatorios', assunto: 'gestao', titulo: 'Como tirar um relatório',
    chaves: 'relatorio relatorios imprimir baixar pdf excel resumo inventario',
    passos: [
      'Vá em <b>Relatórios</b> e escolha o relatório.',
      'Ajuste o período ou os filtros, se houver.',
      'Toque em <b>Baixar PDF</b> ou <b>Baixar Excel</b>.',
    ],
    link: ['relatorios', 'Ir para Relatórios'],
  },
  {
    id: 'backup', assunto: 'gestao', titulo: 'Como fazer uma cópia de segurança dos dados',
    chaves: 'backup copia de seguranca salvar dados guardar todos os dados restaurar',
    passos: [
      'Vá em <b>Relatórios</b>.',
      'Toque em <b>Baixar cópia de segurança</b> e guarde o arquivo.',
      'Para ter tudo em planilha, use <b>Todos os dados em Excel</b>.',
    ],
    link: ['relatorios', 'Ir para Relatórios'],
  },
  {
    id: 'parametros', assunto: 'gestao', titulo: 'Como mudar os prazos dos avisos (gestação, desmame, alertas)',
    chaves: 'configuracoes parametros prazo dias gestacao desmame alerta aviso antecedencia arroba ua',
    passos: [
      'Vá em <b>Configurações</b>, aba <b>Parâmetros de cálculo</b>.',
      'Ajuste os dias (gestação, diagnóstico, desmame, alertas) ou os pesos de arroba e UA.',
      'Toque em <b>Salvar</b>.',
    ],
    link: ['configuracoes', 'Ir para Configurações'],
  },
  {
    id: 'cadastros', assunto: 'gestao', titulo: 'Como incluir uma raça ou categoria nova',
    chaves: 'raca nova categoria nova incluir raca cadastrar raca lista opcoes configuracoes',
    passos: [
      'Vá em <b>Configurações</b> e abra a aba <b>Raças</b> ou <b>Categorias de animais</b>.',
      'Toque em <b>Adicionar</b>, digite o nome e salve.',
    ],
    link: ['configuracoes', 'Ir para Configurações'],
  },
];

// Palavras que querem dizer a mesma coisa (sem acento, minúsculas)
export const SINONIMOS = [
  ['vaca', 'matriz', 'femea', 'novilha'],
  ['animal', 'animais', 'boi', 'bois', 'gado', 'bicho', 'cabeca', 'rebanho'],
  ['bezerro', 'bezerra', 'cria', 'filhote', 'bezerrinho'],
  ['parto', 'nascimento', 'nasceu', 'pariu', 'parir', 'parida'],
  ['pesar', 'pesagem', 'peso', 'balanca', 'pesei'],
  ['vacina', 'vacinar', 'vacinacao', 'vacinei', 'aplicacao', 'aplicar'],
  ['remedio', 'medicamento', 'tratamento', 'tratar', 'doente', 'doenca', 'medicar'],
  ['pasto', 'piquete', 'invernada', 'lote'],
  ['transferir', 'mudar', 'mover', 'trocar', 'passar', 'levar'],
  ['vender', 'venda', 'vendi', 'vendido'],
  ['comprar', 'compra', 'comprei', 'comprado'],
  ['morte', 'morreu', 'morto', 'obito', 'morrer'],
  ['foto', 'imagem', 'camera', 'fotografia'],
  ['cadastrar', 'adicionar', 'incluir', 'registrar', 'lancar', 'colocar', 'novo', 'criar', 'anotar', 'marcar'],
  ['corrigir', 'editar', 'alterar', 'consertar', 'errado', 'erro'],
  ['apagar', 'excluir', 'deletar', 'remover'],
  ['celular', 'telefone', 'aplicativo', 'app', 'instalar'],
  ['internet', 'offline', 'sinal', 'conexao', 'wifi', 'sincronizar'],
  ['funcionario', 'equipe', 'vaqueiro', 'peao', 'usuario', 'pessoa', 'convidar', 'acesso'],
  ['cobertura', 'inseminacao', 'inseminar', 'iatf', 'monta', 'cobrir', 'emprenhar'],
  ['prenhe', 'prenha', 'prenhez', 'gestacao', 'diagnostico', 'toque', 'ultrassom'],
  ['desmame', 'desmamar', 'apartar', 'desmama'],
  ['achar', 'encontrar', 'procurar', 'buscar', 'pesquisar', 'localizar'],
  ['baixar', 'exportar', 'imprimir', 'planilha', 'excel', 'pdf'],
  ['sal', 'racao', 'suplemento', 'suplementacao', 'mineral', 'trato', 'cocho'],
  ['senha', 'login', 'entrar'],
  ['despesa', 'gasto', 'custo', 'conta'],
];
