// Azure 应用注册后填入（个人微软账户选 "consumers" 平台，重定向 URI = 站点 origin + '/'）
export const MSAL_CLIENT_ID = ''
// OneDrive approot（应用专用文件夹）内的同步文件名
export const SYNC_FILE_NAME = 'wordexamrush.json'
// Graph 令牌所需权限，需在 Azure 应用注册中配置对应 delegated permissions
export const MSAL_SCOPES = ['Files.ReadWrite.AppFolder', 'User.Read']
