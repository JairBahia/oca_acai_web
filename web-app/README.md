# Oca do Açaí — versão web

Aplicação web responsiva com cardápio, sacola, acompanhamento do pedido e área administrativa. A API Node.js usa Firebase Admin para ler a coleção `cardapio` e ler/gravar `pedidos` no mesmo projeto do aplicativo Flutter. O preço é consultado novamente no servidor ao criar o pedido. O número do pedido e um token de acompanhamento ficam armazenados no navegador.

## Requisitos

- Node.js 22 ou superior e npm.
- Projeto Firebase `oca-do-acai-c155f`, Firestore e Authentication com login por e-mail e senha habilitado.
- Credenciais de uma conta de serviço com acesso ao projeto. Mantenha o arquivo JSON fora do repositório. Não use a configuração pública do aplicativo web como credencial de servidor.
- UID de uma conta Firebase Auth autorizada para administrar. A API só aceita UIDs indicados em `ADMIN_UIDS`, além de validar o token Firebase; a interface não concede permissões.

## Executar no Windows (PowerShell)

Na pasta `web-app`:

```powershell
npm install
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\caminho-seguro\conta-de-servico.json'
$env:FIREBASE_PROJECT_ID = 'oca-do-acai-c155f'
$env:ADMIN_UIDS = 'uid-do-administrador'
npm start
```

Abra `http://localhost:3000`. Para autorizar mais de um administrador, separe os UIDs por vírgula. Adicione o domínio de hospedagem aos domínios autorizados do Firebase Authentication antes de usar o login fora de localhost. O arquivo `.env.example` documenta as variáveis; elas devem ser fornecidas pelo ambiente, pois o servidor não carrega arquivos `.env` automaticamente.

O painel fica em `/admin`. Para habilitar o botão **Continuar com Google**, ative o provedor Google em Authentication → Método de login, informe o nome público e o e-mail de suporte e salve. Verifique em Authentication → Configurações → Domínios autorizados se o domínio usado no navegador está autorizado. Depois do primeiro login Google, copie o UID correspondente na lista de usuários do Authentication e acrescente-o a `ADMIN_UIDS` no ambiente do servidor. Reinicie o servidor para aplicar a alteração. O login Google identifica a conta, mas não concede acesso administrativo automaticamente.

Para uma avaliação em que todas as contas autenticadas do projeto devam acessar o painel inteiro, defina `$env:ALLOW_ANY_AUTHENTICATED_ADMIN = 'true'` antes de executar `npm start`. Isso permite que **qualquer conta autenticada no Firebase** veja pedidos e cadastre, edite ou exclua produtos no banco conectado, inclusive dados reais. Por padrão, essa opção fica desativada e somente os UIDs em `ADMIN_UIDS` têm acesso. Não habilite em uma instalação pública com dados reais sem aceitar esse efeito; prefira um projeto separado de demonstração. Reinicie o servidor após mudar a variável.

A documentação interativa está em `/api/docs` e o documento OpenAPI em `/api/openapi.json`. O formulário administrativo aceita upload de imagens JPEG, PNG ou WebP de até 4 MB, URL HTTPS ou caminho já existente em `assets/images/`. As imagens enviadas são divididas em partes e armazenadas na coleção `imagensCardapio` do Firestore; não é necessário ativar o Firebase Storage. As imagens geram leituras, gravações e armazenamento no Firestore. Os arquivos enviados são independentes dos produtos: substituí-los, cancelar o formulário depois do envio ou excluir um produto não exclui automaticamente a imagem correspondente.

## Compatibilidade e operação

Os produtos existentes mantêm os campos `name`, `description`, `price`, `imagePath` e `category`. O campo `ingredients` é opcional para produtos antigos. Os pedidos web mantêm `itens`, `total`, `status` e `criadoEm`, acrescentando nome, mesa, histórico e um hash do token de acompanhamento. Pedidos antigos sem nome ou mesa continuam visíveis no painel. O status antigo `finalizado` é apresentado como `entregue` no painel web.

O aplicativo Flutter original utiliza `Image.asset`; ele não exibe automaticamente as novas imagens que usam `/api/images/...`. Caso o aplicativo antigo continue em uso, será preciso adaptá-lo para buscar essas imagens na API publicada.

Pedidos e status são transmitidos pelo servidor em tempo real, com reconexão automática. O cardápio é atualizado a cada 30 segundos. O acompanhamento é restrito ao token salvo no navegador que fez o pedido. Apagar os dados do navegador remove esse acesso. Conexões ativas geram leituras do Firestore; monitore as cotas do projeto.

## Validação

Execute `npm test` para os testes sem serviços externos. Para o fluxo integrado, instale Java 21 ou superior e Firebase CLI e execute, nesta pasta:

```powershell
firebase emulators:exec --only auth,firestore --project demo-oca-local --config firebase.test.json "node --test integration.test.js"
```

Esse comando usa o projeto de demonstração `demo-oca-local` e emuladores locais; não faz alterações no banco real. O teste cobre autenticação de demonstração, produto, imagem, pedido, acompanhamento, fluxo de eventos e histórico. Uma apresentação real também deve ser conferida em navegadores e dispositivos diferentes.

Antes de disponibilizar o sistema, configure HTTPS, revise as regras existentes do Firestore e os acessos de outras aplicações: a proteção da API não substitui regras do Firebase para clientes que acessam o Firestore diretamente. Revise também autenticação, limites de uso e backups no ambiente de produção. A API usa Firebase Admin e, portanto, não depende das regras de segurança do cliente.

O enunciado cita PostgreSQL, MySQL e MongoDB como bancos possíveis. Esta versão preserva o Firestore por solicitação de reutilizar os dados existentes; confirme com o professor se essa escolha atende ao critério da disciplina. O termo de concordância, validação do estabelecimento, relatório, identificação acadêmica dos integrantes e vídeo dependem dos envolvidos e não são gerados pela aplicação.
