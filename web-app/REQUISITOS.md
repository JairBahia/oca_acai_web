# Revisão dos requisitos — Prática Extensionista VII

Esta revisão compara o código disponível com o enunciado. Não é uma certificação de nota e não substitui testes integrados em um ambiente de homologação ou a validação do estabelecimento.

| Requisito | Situação e limite encontrado |
| --- | --- |
| RF001 Cardápio | Implementado: categorias e busca assíncronas, nome, descrição, preço e imagem a partir da API. Consultas carregam produtos atualizados a cada 30 segundos. |
| RF002 Detalhes | Implementado: nome, descrição, preço, imagem e botão adicionar. Ingredientes dependem de dados cadastrados; produtos antigos podem não informá-los. |
| RF003 Carrinho | Implementado: itens, quantidades e contador permanecem durante navegação na página. O carrinho não persiste após recarregar. |
| RF004 Pedido | Implementado: revisão, nome e mesa, envio POST e número de acompanhamento. O valor é recalculado no servidor. Testar o fluxo completo em banco de homologação. |
| RF005 Login admin | Implementado com Firebase Auth e autorização por UID ou modo de avaliação por variável. Provedor Google depende de ativação e domínio autorizado no Firebase. |
| RF006 Produtos | Cadastro, edição e exclusão implementados. Upload de imagem para o Firestore em partes, ou URL e caminhos existentes; teste integrado executado nos emuladores. |
| RF007 Pedidos | Listagem, filtro e aviso visual implementados; servidor usa listener do Firestore e transmissão SSE ao navegador, com reconexão automática. Teste integrado dos eventos nos emuladores. |
| RF008 Status | Atualização e histórico com data e usuário implementados; o acompanhamento também recebe eventos SSE. Testado em emuladores. Pedidos antigos podem não ter histórico. |
| RF009 Swagger | Interface e OpenAPI em `/api/docs` e `/api/openapi.json`, com esquemas, exemplos, erros, envio de imagem e rotas SSE. A visualização interativa ainda deve ser conferida no ambiente publicado. |

## Requisitos e entregas adicionais

- O backend é Node.js com API REST. O armazenamento existente é Firestore; o enunciado cita PostgreSQL, MySQL e MongoDB. Confirme a aceitação do Firestore com o professor.
- O repositório GitHub contém o código. A hospedagem precisa executar Node.js; GitHub Pages sozinho serve arquivos estáticos e não executa a API.
- Termo de concordância, avaliação pelo estabelecimento, relatório conforme modelo, identificação dos alunos e vídeo MP4 são entregas que dependem da equipe e do cliente.
- A implementação tem testes integrados em emuladores locais; a validação com professor, estabelecimento, dispositivos e ambiente publicado ainda deve ser realizada.
- Acesso amplo a qualquer conta autenticada, quando habilitado, concede ao usuário acesso aos pedidos e permissão para modificar ou excluir produtos. Use banco separado para demonstração pública.
