/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';

// Permissões da pessoa logada, para qualquer tela esconder/desabilitar o que ela não pode usar.
// O servidor é quem realmente decide (ver src/shared/permissions.ts); isto é só a parte visual.
interface PermissionsContextValue {
  can: (permission: string) => boolean;
  isAdmin: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({ can: () => false, isAdmin: false });

export const PermissionsProvider = PermissionsContext.Provider;
export const usePermissions = () => useContext(PermissionsContext);
