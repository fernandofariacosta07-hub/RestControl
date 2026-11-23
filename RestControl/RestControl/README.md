# RestControl

Sistema web de gestão para restaurantes de pequeno e médio porte. Reúne em uma única ferramenta o atendimento no salão, no balcão e por delivery, o fluxo da cozinha, o estoque de ingredientes, o caixa e os relatórios, com uma interface que se adapta a computadores, tablets e celulares.

Projeto Integrador: Laboratório de Programação. Curso de Graduação Tecnológica em Engenharia de Software, Universidade Santo Amaro (UNISA).

## Como executar

O sistema roda direto no navegador e não precisa de instalação nem de internet.

1. Baixe o repositório (botão **Code** → **Download ZIP**) e extraia a pasta.
2. Abra o arquivo `index.html` no navegador.

Para usar no celular, abra a pasta no VS Code com a extensão **Live Server** e acesse, pelo celular na mesma rede Wi-Fi, o endereço mostrado (por exemplo, `http://IP-do-computador:5500`).

Para ver o sistema como cada membro da equipe, abra o menu do usuário (•••) → **Meu perfil** e troque o cargo (Gerente, Garçom, Cozinha ou Caixa).

## Módulos

| Módulo | O que faz |
|---|---|
| Dashboard | Quadro do serviço: resumo do momento, números do dia, mapa do salão, fila da cozinha, vendas da semana, mais vendidos, próximas reservas e últimos pedidos |
| Mesas | Mapa do salão; abrir mesa, lançar pedido, pré-conta, fechar conta, transferir e juntar mesas |
| Reservas | Agenda com checagem de conflito de horário, chegada do cliente, cancelamento e "não compareceu" automático |
| Cardápio | Produtos por categoria, busca, ficha técnica, pausa manual e pausa automática por falta de ingrediente |
| Pedidos | Pedidos de mesa, balcão e delivery; observações por item, edição, cancelamento com motivo, recebimento e impressão da comanda |
| Cozinha | Quadro Recebido / Em preparo / Pronto, tempo de espera, alertas de atraso, aviso sonoro e modo tela cheia |
| Estoque | Entradas, saídas e perdas, mínimo e máximo, histórico e sugestão de compras |
| Financeiro | Receitas, despesas, descontos, fundo de troco e fechamento do caixa |
| Relatórios | Vendas por período, mais vendidos, vendas por categoria e exportação em CSV |

## Regras de negócio

- **Tudo integrado:** o pedido lançado no salão aparece na cozinha, dá baixa no estoque pela ficha técnica e, quando pago, é registrado no financeiro.
- **Estoque:** um pedido é bloqueado se faltar ingrediente. O produto sem ingrediente suficiente sai do cardápio e volta sozinho quando o estoque é reposto.
- **Recebimento:** desconto em % ou R$ (sempre com motivo), cortesia, taxa de serviço de 10% opcional, divisão da conta (partes iguais, valores livres ou por item) e cálculo de troco.
- **Reservas:** a mesa fica reservada 60 minutos antes do horário; sem chegada em 15 minutos após o horário, a reserva vira "não compareceu" e a mesa é liberada.
- **Cozinha:** pedidos ficam em "Atenção" após 10 minutos e "Atrasado" após 20 minutos.
- **Compras:** são sugeridos os itens abaixo do mínimo ou que acabam em menos de 3 dias, pelo consumo médio dos últimos 14 dias.

Os valores dessas regras ficam no topo de `js/data.js` e podem ser ajustados.

## Perfis de acesso

| Perfil | Páginas | Vê valores / faturamento |
|---|---|---|
| Gerente | todas | sim / sim |
| Garçom | Dashboard, Mesas, Reservas, Cardápio, Pedidos | valores |
| Cozinha | Cozinha, Pedidos, Estoque, Cardápio | não |
| Caixa | Dashboard, Mesas, Pedidos, Financeiro | sim / sim |

As permissões ficam no objeto `PERM` em `js/core.js`.

## Experiência de uso

- Interface responsiva: no celular, barra de navegação inferior, tabelas em forma de cartões, cozinha em abas e janelas que sobem da parte de baixo da tela.
- Modo escuro (botão ☾ ou tecla T), com a preferência salva no navegador.
- Atalhos de teclado: N (novo pedido), R (nova reserva), / (buscar no cardápio), 1–9 (páginas), F (tela cheia da cozinha), T (tema) e ? (lista de atalhos).
- Impressão no formato de impressora térmica de 80 mm: comanda da cozinha, pré-conta, comprovante de pagamento e lista de compras.
- Acessibilidade: janelas com `role="dialog"`, foco preso dentro da janela aberta, fechamento com Esc e campos de 16 px no celular.

## Tecnologias

- HTML, CSS e JavaScript puro, sem frameworks nem bibliotecas externas.
- Fontes *Bricolage Grotesque* e *Figtree*, incluídas na pasta `fonts/` (SIL Open Font License).

## Estrutura do código

| Arquivo | Conteúdo |
|---|---|
| `index.html` | estrutura da página |
| `css/style.css` | identidade visual, modo escuro e versão para celular e tablet |
| `js/utils.js` | formatação, datas, janelas, avisos e som |
| `js/data.js` | estado único `DB`, consultas, regras de negócio (`OPS`) e dados de demonstração |
| `js/core.js` | perfis e permissões (`PERM`), navegação, contadores e componentes de tela |
| `js/print.js` | impressão de comanda, conta e lista de compras |
| `js/mobile.js` | navegação e ícones da versão para celular |
| `js/pages/*.js` | uma página por arquivo (`conta.js` é a janela de recebimento) |
| `js/app.js` | menu do usuário, notificações, guia de uso, login e inicialização |

Toda alteração de dados passa pelas funções de `OPS`, que validam as regras e redesenham a tela. Todo texto digitado pelo usuário é tratado antes de ser exibido (`esc()` em `js/utils.js`).

## Limitações

Este é um protótipo que roda apenas no navegador. Os dados são de demonstração e voltam ao estado inicial quando a página é recarregada. Não há servidor, banco de dados nem autenticação real.

## Próximos passos

- Servidor com banco de dados para guardar as informações e permitir o uso simultâneo em vários aparelhos.
- Autenticação de usuários com registro das ações de cada funcionário.
- Tela de configurações para o gestor.
- Testes com a equipe de um restaurante real.

## Autor

Fernando Faria Costa.
