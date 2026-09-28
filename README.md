# PRF Administrativo — Radar + Roda Contínua

Painel público com a roda PRFADM, o andamento do projeto e uma área para ler materiais e questões sincronizados do Notion.

- **Painel:** https://rodrigorosadantas.github.io/prf-administrativo-dashboard/
- **Fonte de verdade:** [Radar PRF Administrativo no Notion](https://app.notion.com/p/3e8cf5a2673181679cd2f5532e0abf60)
- **Materiais diários:** [Notion](https://app.notion.com/p/3e8cf5a267318105a5f5fa52cabf3a3a)
- **Questões diárias:** [Notion](https://app.notion.com/p/3e8cf5a267318197b509f976a15315d5)

## Sincronização segura

O GitHub Actions lê as páginas do Notion e grava um snapshot estático em `content/prf-notion.json`. O navegador do site não recebe o token da API.

1. No Notion, crie uma conexão interna com a permissão **Read content only** e sem acesso a informações de usuários.
2. Compartilhe com essa conexão as páginas **Materiais diários | PRF Administrativo** e **Questões diárias | PRF Administrativo**. Se a API não conseguir ler uma subpágina, conecte também a página correspondente.
3. No GitHub, abra **Settings → Secrets and variables → Actions → New repository secret** e salve o token com o nome `PRF_ADM_GITHUB`. O workflow também aceita `NOTION_TOKEN`.
4. Execute **Actions → Sync PRF ADM content from Notion → Run workflow** para a primeira carga.

Depois disso, a sincronização roda diariamente às 07h15 no horário de Brasília. O botão **Atualizar agora** no site abre esse mesmo workflow no GitHub Actions; por segurança, confirme a execução clicando em **Run workflow**. Ao concluir a leitura do Notion, o site é republicado automaticamente. Como este repositório e o site são públicos, o texto sincronizado também fica público.

## Estado atual das questões

O Notion registra a trilha de questões em 0/33 e prevê iniciá-la depois que os materiais chegarem a 33/33. Enquanto isso, o leitor mostra as regras da trilha e informa quando ainda não existe bateria para o código; ele não inventa questões ou gabaritos.
