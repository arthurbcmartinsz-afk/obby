# OBBY

**Sistema web para registrar e analisar os dados de testes do robô TBR.**

O OBBY organiza os testes realizados com o robô e transforma os resultados das rodadas em indicadores para acompanhar o desempenho ao longo do tempo. Cada rodada pode registrar o resultado das três missões avaliadas:

1. **Missão 1 — Rampa**
2. **Missão 2 — Entrega do Carrinho**
3. **Missão 3 — Triângulos**

## O que o sistema faz

- Registra testes e rodadas pelo terminal integrado.
- Guarda o resultado de cada missão como sucesso (`S`) ou falha (`N`), além de observações e tags.
- Permite invalidar uma rodada e corrigir um resultado com justificativa.
- Mostra percentuais por missão e no geral, evolução entre testes, últimas rodadas e relatórios.
- Filtra registros por teste, missão e tags.
- Importa e exporta os dados de um teste em CSV.

O backup completo no formato próprio `.obby`, mencionado na interface, ainda está planejado e não foi implementado.

## Como executar

O projeto é um frontend estático feito com HTML, CSS e JavaScript puro. Não há etapa de build nem dependências de pacote.

Na pasta do projeto, inicie um servidor estático, por exemplo:

```bash
python -m http.server 8000
```

Depois, abra <http://localhost:8000> no navegador.

## Primeiros passos

1. Crie um teste e torne-o ativo:

   ```text
   /teste novo Teste de 21/09
   ```

2. Registre os resultados das missões na ordem M1, M2 e M3. Por exemplo, `S N S` registra sucesso na Rampa, falha na Entrega do Carrinho e sucesso nos Triângulos. Uma observação pode acompanhar a rodada:

   ```text
   S N S # ajustar a velocidade na rampa
   ```

3. Use as abas **Dashboard**, **Evolução** e **Relatórios** para acompanhar os resultados. A aba **Dados** permite importar ou exportar CSV.

Digite `/ajuda` no terminal ou abra a aba **Ajuda** para consultar os comandos disponíveis.

| Comando | Ação |
| --- | --- |
| `/teste novo [nome]` | Cria um teste e o seleciona |
| `/teste` | Lista os testes registrados |
| `/status` | Resume o teste ativo |
| `/missao` | Mostra o resultado por missão no teste ativo |
| `S N S*` | Registra uma rodada invalidada, excluída dos cálculos |
| `# observação` | Adiciona uma observação geral ao teste ativo |
| `!12 S S N # motivo` | Corrige os resultados da rodada 12 e registra o motivo |
| `/selecionar 2` | Seleciona o teste de ID 2 |
| `/csv exportar [id]` | Exporta o teste ativo ou o teste indicado |
| `/csv importar` | Importa um CSV como um novo teste |
| `/voltar` | Pede confirmação e desfaz a última alteração da sessão |

## Armazenamento atual

Os dados são salvos no navegador, usando `localStorage`; quando disponível, o OBBY também tenta manter uma cópia auxiliar no IndexedDB. O carregamento atual é feito a partir do `localStorage`.

Esse armazenamento é local ao navegador e à origem do site. Por isso, os dados ainda não são compartilhados entre navegadores, dispositivos ou integrantes da equipe, e podem ser perdidos se os dados do navegador forem apagados. O CSV permite guardar os dados de cada teste, mas não substitui um backup completo do estado do navegador.

O OBBY ainda não possui API nem banco de dados online. A sincronização entre navegadores é o principal objetivo do roadmap de backend abaixo.

## Roadmap do backend

**Objetivo:** manter os fluxos atuais do OBBY e trocar o armazenamento local por persistência no MySQL, para que o mesmo conjunto de dados fique disponível em outros navegadores.

### 1. Exportar e entender os dados atuais

- [ ] Mapear o estado `obby_data_v1`: testes (ID, nome, ativo e tags), rodadas (ID, teste, resultados, invalidação, observação, tags, tipo, missão foco e correção com original, resultado corrigido e motivo), observações gerais e contador de rodadas.
- [ ] Implementar a exportação completa `.obby` diretamente dos dados salvos no navegador. O CSV atual exporta um teste por vez e não é suficiente para a migração integral.
- [ ] Analisar exportações reais dos navegadores da equipe para confirmar o significado dos campos, os vínculos entre registros e as necessidades do backend antes de fechar o modelo MySQL.

### 2. Modelar e migrar para MySQL

- [ ] Definir as tabelas e relações a partir dos dados exportados, preservando o que cada registro representa hoje.
- [ ] Criar uma importação repetível do arquivo completo para o MySQL, mantendo identificadores, resultados e contexto sem duplicar registros.
- [ ] Comparar os dados antes e depois da importação para confirmar que o novo banco representa o armazenamento atual.

### 3. Criar o backend e conectar o OBBY

- [ ] Implementar a API com **FastAPI** e persistência em **MySQL**.
- [ ] Executar API e banco com **Docker**.
- [ ] Conectar o frontend à API para carregar e salvar os dados do sistema no banco compartilhado.
- [ ] Manter os fluxos existentes de registro, correção, relatórios e importação/exportação.

### 4. Publicar e validar na VPS

- [ ] Preparar a configuração Docker para implantação na VPS, com dados do MySQL persistentes entre reinicializações.
- [ ] Documentar como configurar, iniciar, atualizar e fazer backup do serviço.
- [ ] Validar a migração dos dados e o uso do mesmo conjunto de dados em navegadores diferentes.
- [ ] Manter arquivos e funções com nomes claros conforme sua responsabilidade e uma navegação intuitiva, para que integrantes que conhecem Pybricks consigam entender o projeto rapidamente.

### Critérios de conclusão

- A exportação completa representa os dados que hoje ficam salvos no navegador, e a importação para MySQL preserva seu significado e suas relações.
- Os mesmos dados ficam disponíveis em navegadores diferentes e continuam salvos após atualizar a página ou reiniciar o serviço.
- Os fluxos de registro e análise continuam familiares; a persistência online é a principal mudança para quem usa o sistema.
- A navegação é intuitiva e os nomes no código deixam claro o papel de cada parte, permitindo que integrantes que conhecem Pybricks entendam o projeto rapidamente.
- A implantação Docker na VPS, a atualização do serviço e o backup estão documentados.

## Estrutura do projeto

```text
.
├── index.html              # Estrutura das telas
├── styles.css              # Estilos e layout
└── scripts/
    ├── app.js              # Inicialização
    ├── data.js             # Modelo e armazenamento local
    ├── navigation.js       # Navegação entre telas
    ├── terminal.js         # Comandos e registro de dados
    └── views.js            # Dashboard, evolução, relatórios e ajuda
```
