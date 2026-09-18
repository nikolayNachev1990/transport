import { db } from "../../resources.mjs";
import AuthService from "../../auth/services/auth.service.mjs";

const usersTable = "users";

interface UserRow {
  id: string;
  [key: string]: unknown;
}

class LanguageService {
  authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async switchUserLanguage(userId: string, language: string) {
    const row = await db.updateByWhere<UserRow>(usersTable, { id: userId }, { language });

    if (!row) {
      return null;
    }
    await this.authService.emitUserUpdateEvent(row);
    return true;
  }
}

export default LanguageService;
