import React, { FunctionComponent } from 'react'

type DebugProps = {
  it: any,
}

export const Debug: FunctionComponent<DebugProps> = ({it}) => {
  const serialized = JSON.stringify(it, null, 2);

  return <pre>
    {serialized}
  </pre>
}
